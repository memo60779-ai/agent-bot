-- =====================================================================
-- Row Level Security
--   * Customer: only their own requests / complaints / profile.
--   * Provider: only requests offered or assigned to them.
--   * Reviews: inserted only via submit_review(); nobody but admin can
--     update (hide) them; providers can never modify reviews.
--   * Verification: only admin can approve (review_verification()).
--   * Status changes on requests only via RPCs (no client UPDATE policy).
-- =====================================================================

alter table public.users                 enable row level security;
alter table public.services              enable row level security;
alter table public.providers             enable row level security;
alter table public.provider_portfolio    enable row level security;
alter table public.verification_requests enable row level security;
alter table public.service_requests      enable row level security;
alter table public.provider_requests     enable row level security;
alter table public.reviews               enable row level security;
alter table public.complaints            enable row level security;

-- Start from zero and grant only what the app needs.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.services, public.providers, public.provider_portfolio, public.reviews to anon;

grant select, update                  on public.users                 to authenticated;
grant select, insert, update, delete  on public.services              to authenticated;
grant select, insert, update          on public.providers             to authenticated;
grant select, insert, delete          on public.provider_portfolio    to authenticated;
grant select                          on public.verification_requests to authenticated;
grant select, insert, update          on public.service_requests      to authenticated;
grant select                          on public.provider_requests     to authenticated;
grant select, update                  on public.reviews               to authenticated;
grant select, insert, update          on public.complaints            to authenticated;

-- users RLS hides other users' rows, so policies on other tables use this
create or replace function public.is_user_active(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.users where id = p_user_id), false);
$$;
grant execute on function public.is_user_active(uuid) to anon, authenticated;

-- ---------- users ----------
create policy users_select_self_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- role / is_active / is_demo are protected by trigger protect_user_fields()
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- services ----------
create policy services_public_read on public.services
  for select to anon, authenticated
  using (is_active or public.is_admin());

create policy services_admin_insert on public.services
  for insert to authenticated with check (public.is_admin());
create policy services_admin_update on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy services_admin_delete on public.services
  for delete to authenticated using (public.is_admin());

-- ---------- providers ----------
-- Public sees only verified providers whose account is active.
create policy providers_public_read on public.providers
  for select to anon, authenticated
  using (
    (verification_status = 'verified' and public.is_user_active(id))
    or id = auth.uid()
    or public.is_admin()
  );

create policy providers_insert_self on public.providers
  for insert to authenticated
  with check (
    id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'provider')
  );

-- verification / rating / counters are protected by trigger protect_provider_fields()
create policy providers_update_self_or_admin on public.providers
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- provider_portfolio ----------
create policy portfolio_public_read on public.provider_portfolio
  for select to anon, authenticated
  using (
    exists (select 1 from public.providers p where p.id = provider_portfolio.provider_id)
  ); -- inherits providers visibility through RLS on providers

create policy portfolio_insert_own on public.provider_portfolio
  for insert to authenticated
  with check (provider_id = auth.uid() and is_demo = false);

create policy portfolio_delete_own_or_admin on public.provider_portfolio
  for delete to authenticated
  using (provider_id = auth.uid() or public.is_admin());

-- ---------- verification_requests (never public) ----------
create policy verification_select_own_or_admin on public.verification_requests
  for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
-- inserts: submit_verification(); decisions: review_verification() (admin only)

-- ---------- service_requests ----------
create policy requests_select_parties on public.service_requests
  for select to authenticated
  using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or public.is_offered_request(id)
    or public.is_admin()
  );

create policy requests_insert_customer on public.service_requests
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'NEW'
    and provider_id is null
    and is_demo = false
    and exists (select 1 from public.users u where u.id = auth.uid() and u.is_active)
  );

-- Only admin can UPDATE directly. Everybody else uses update_request_status() etc.
create policy requests_update_admin on public.service_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- provider_requests (offers) ----------
create policy offers_select_parties on public.provider_requests
  for select to authenticated
  using (
    provider_id = auth.uid()
    or public.owns_request(request_id)
    or public.is_admin()
  );
-- inserts: send_offer(); updates: respond_offer()

-- ---------- reviews ----------
create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (not is_hidden or customer_id = auth.uid() or public.is_admin());

-- Only admin can update (hide/unhide). No insert policy: submit_review() only.
create policy reviews_update_admin on public.reviews
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- complaints ----------
create policy complaints_select_own_or_admin on public.complaints
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create policy complaints_insert_after_completion on public.complaints
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'open'
    and admin_notes is null
    and is_demo = false
    and exists (
      select 1 from public.service_requests r
      where r.id = complaints.request_id
        and r.customer_id = auth.uid()
        and r.status in ('COMPLETED', 'RATED')
        and (complaints.provider_id is null or complaints.provider_id = r.provider_id)
    )
  );

create policy complaints_update_admin on public.complaints
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
