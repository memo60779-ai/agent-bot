-- =====================================================================
-- Sign up / log in with an Iraqi mobile number + password (no email, no SMS).
-- Most tradespeople don't use email. The account is created directly in
-- auth.users with an internal address <phone>@users.fanni.app (never shown,
-- never emailed); login uses that address behind the scenes.
-- =====================================================================

-- 07XXXXXXXXX from any common input: Arabic/Persian digits, spaces, +964, 7XXXXXXXXX
create or replace function public.normalize_iq_phone(p text) returns text
language plpgsql immutable as $$
declare
  v text := translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
begin
  v := regexp_replace(v, '\D', '', 'g');
  if v like '9647%' then v := '0' || substr(v, 4); end if;
  if v like '7%' and length(v) = 10 then v := '0' || v; end if;
  if v !~ '^07[0-9]{9}$' then return null; end if;
  return v;
end $$;

create or replace function public.phone_signup(
  p_phone text, p_password text, p_full_name text, p_role text default 'customer'
) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text := public.normalize_iq_phone(p_phone);
  v_email text;
  v_id uuid := gen_random_uuid();
begin
  if v_phone is null then
    raise exception 'invalid_phone';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'weak_password';
  end if;
  if length(trim(coalesce(p_full_name, ''))) < 2 then
    raise exception 'name_required';
  end if;

  v_email := v_phone || '@users.fanni.app';
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'phone_taken';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', trim(p_full_name), 'phone', v_phone,
                       'role', case when p_role = 'provider' then 'provider' else 'customer' end),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());
  return v_email;
end $$;

-- Phone accounts have no email for "forgot password": admin sets a new one.
create or replace function public.admin_reset_password(p_user_id uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'weak_password';
  end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
  where id = p_user_id;
end $$;

revoke execute on function public.phone_signup(text, text, text, text), public.admin_reset_password(uuid, text)
  from public, anon, authenticated;
grant execute on function public.phone_signup(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
