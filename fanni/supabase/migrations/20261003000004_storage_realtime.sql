-- =====================================================================
-- Storage buckets
--   avatars            public   {uid}/file
--   portfolio          public   {uid}/file
--   request-photos     PRIVATE  {uid}/file — owner, offered/assigned provider, admin
--   verification-docs  PRIVATE  {uid}/file — owner + admin ONLY (never public)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',           'avatars',           true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio',         'portfolio',         true,  8388608,  array['image/jpeg', 'image/png', 'image/webp']),
  ('request-photos',    'request-photos',    false, 8388608,  array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public;

-- Public buckets: anyone reads; users write only inside their own folder.
create policy "public buckets read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'portfolio'));

create policy "own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'portfolio', 'request-photos', 'verification-docs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder delete (public buckets)" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'portfolio')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "request photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_request_photo(name)
      or public.is_admin()
    )
  );

create policy "verification docs read: owner or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- =====================================================================
-- Realtime: live status updates on the request page / provider inbox.
-- RLS still applies to realtime payloads.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.service_requests, public.provider_requests;
  end if;
end $$;
