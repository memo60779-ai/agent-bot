-- =====================================================================
-- فني — DEMO DATA  (⚠️ NOT REAL PEOPLE)
--
-- Every demo row has is_demo = true and every demo account uses an
-- @fanni.test / @demo.fanni.test email. Remove everything before launch
-- with supabase/cleanup_demo.sql.
--
-- Password for ALL demo accounts:  Fanni@2026
-- =====================================================================

set search_path = public, extensions;
-- lets the seed write protected fields (verification, ratings, roles)
select set_config('fanni.system', 'on', false);

-- ---------------------------------------------------------------------
-- Services (8). The first 5 are the "main" categories that get demo providers.
-- ---------------------------------------------------------------------
insert into public.services (slug, name_ar, icon, description_ar, sort_order, problem_types) values
 ('plumbing',    'سباكة',              'droplets',        'تسريبات، مجاري، حنفيات وسخانات',
   1, array['تسريب مي', 'انسداد مجاري', 'تبديل حنفية أو خلاط', 'مشكلة بالسخان', 'تأسيس صحيات', 'شي ثاني']),
 ('electrical',  'كهرباء',             'zap',             'انقطاع، بلكات، إنارة وتأسيس',
   2, array['انقطاع بجزء من البيت', 'تبديل بلكات وسويچات', 'تركيب إنارة', 'مشكلة بالطبلة أو الجوزة', 'ربط مولدة أو أمبيرات', 'تأسيس كهرباء', 'شي ثاني']),
 ('ac',          'تكييف وتبريد',        'snowflake',       'سبلت، غاز، تنظيف ونصب',
   3, array['السبلت ما يبرد', 'تعبئة غاز', 'تنظيف وصيانة سبلت', 'نصب أو فتح سبلت', 'تصليح مبردة هواء', 'شي ثاني']),
 ('appliances',  'صيانة أجهزة منزلية',  'washing-machine', 'غسالات، ثلاجات، طباخات',
   4, array['غسالة', 'ثلاجة أو مجمدة', 'طباخ أو فرن', 'سخان مي', 'ميكرويف', 'شي ثاني']),
 ('carpentry',   'نجارة',              'hammer',          'أبواب، كبتات، مطابخ وأثاث',
   5, array['تصليح باب', 'تفصيل مطبخ أو كاونتر', 'تصليح كبتات وأثاث', 'تركيب أقفال ومقابض', 'شي ثاني']),
 ('painting',    'صبغ وديكور',          'paint-roller',    'صبغ، جبس بورد، ورق جدران',
   6, array['صبغ غرفة', 'صبغ بيت كامل', 'جبس بورد وديكور', 'ورق جدران', 'معالجة رطوبة', 'شي ثاني']),
 ('aluminum',    'ألمنيوم وحدادة',      'door-closed',     'شبابيك، أبواب حديد، حمايات ولحام',
   7, array['شبابيك ألمنيوم', 'أبواب حديد', 'حماية شبابيك', 'تصليح باب كراج أو سحاب', 'لحام', 'شي ثاني']),
 ('cleaning',    'تنظيف',              'sparkles',        'تنظيف بيوت، سجاد وخزانات',
   8, array['تنظيف بيت كامل', 'تنظيف بعد البناء أو الصبغ', 'غسل سجاد وموكيت', 'تنظيف خزانات مي', 'شي ثاني']);

-- ---------------------------------------------------------------------
-- Helper: create a confirmed email/password auth user (+ identity).
-- The on_auth_user_created trigger creates the public.users row.
-- ---------------------------------------------------------------------
create or replace function pg_temp.demo_user(
  p_id uuid, p_email text, p_name text, p_phone text, p_role text
) returns uuid language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    crypt('Fanni@2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_name, 'phone', p_phone, 'role', p_role, 'is_demo', true),
    now() - interval '120 days', now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return p_id;
end $$;

-- ---------------------------------------------------------------------
-- Test accounts
-- ---------------------------------------------------------------------
select pg_temp.demo_user('00000000-0000-4000-a000-000000000001', 'admin@fanni.test',            'مدير المنصة',   '07700000001', 'customer');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000002', 'customer@fanni.test',         'زهراء محمد',    '07700000002', 'customer');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000003', 'provider@fanni.test',         'حيدر كاظم',     '07700000003', 'provider');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000004', 'provider.pending@fanni.test', 'سيف علي',       '07700000004', 'provider');

update public.users set role = 'admin' where id = '00000000-0000-4000-a000-000000000001';
update public.users set city = 'كربلاء', area = 'حي الحسين' where id = '00000000-0000-4000-a000-000000000002';

-- Demo customers (they "wrote" the demo requests & reviews)
select pg_temp.demo_user(('00000000-0000-4000-c000-00000000000' || n)::uuid,
                         'customer' || n || '@demo.fanni.test', name, '0780000000' || n, 'customer')
from (values (1, 'نور الهدى عباس'), (2, 'أحمد جاسم'), (3, 'فاطمة حسين'), (4, 'محمد عبد الرضا'), (5, 'مريم كريم'))
  as t(n, name);

update public.users u set city = 'كربلاء', area = a.area
from (values ('00000000-0000-4000-c000-000000000001'::uuid, 'حي العباس'),
             ('00000000-0000-4000-c000-000000000002'::uuid, 'حي البلدية'),
             ('00000000-0000-4000-c000-000000000003'::uuid, 'حي الموظفين'),
             ('00000000-0000-4000-c000-000000000004'::uuid, 'حي النقيب'),
             ('00000000-0000-4000-c000-000000000005'::uuid, 'حي رمضان')) as a(id, area)
where u.id = a.id;

-- ---------------------------------------------------------------------
-- Providers: 2 test providers + 20 demo providers over the 5 main services
-- ---------------------------------------------------------------------
create temp table demo_providers (
  n int, name text, display_name text, service text, years int, area text, city text,
  status public.verification_status, available boolean, bio text, lat float8, lng float8
);
insert into demo_providers values
 ( 1, 'علي عبد الأمير',  'علي عبد الأمير للسباكة',   'plumbing',   12, 'حي العباس',     'كربلاء', 'verified', true,  'سباك من 12 سنة، أشتغل تسريبات ومجاري وتأسيس صحيات كامل. أجي بالوقت وأنظف بعد الشغل.', 32.6205, 44.0312),
 ( 2, 'مصطفى جبار',      'مصطفى جبار',               'plumbing',    6, 'حي البلدية',    'كربلاء', 'verified', true,  'متخصص بالسخانات والخلاطات وكشف التسريب بدون تكسير قدر الإمكان.', 32.6089, 44.0201),
 ( 3, 'كرار حسن',        'كرار حسن - صحيات',          'plumbing',    9, 'حي الموظفين',   'كربلاء', 'verified', false, 'تأسيس وصيانة صحيات للبيوت والمحلات. شغل نظيف ومضمون.', 32.6301, 44.0155),
 ( 4, 'منتظر هادي',      'منتظر هادي',               'plumbing',    3, 'الهندية',       'الهندية (طويريج)', 'pending', false, 'سباك شاب، أشتغل بالهندية والمناطق القريبة.', 32.5440, 44.2210),
 ( 5, 'أحمد سلمان',      'أحمد سلمان للكهرباء',       'electrical', 15, 'حي الحسين',     'كربلاء', 'verified', true,  'كهربائي بيوت من 15 سنة. تأسيس، طبلات، ربط أمبيرات ومولدات.', 32.6150, 44.0405),
 ( 6, 'عباس فاضل',       'عباس فاضل',                'electrical',  8, 'حي العباس',     'كربلاء', 'verified', true,  'أصلح الانقطاعات وأكشف الأعطال بسرعة. تركيب إنارة وثريات.', 32.6221, 44.0298),
 ( 7, 'زيد خالد',        'زيد خالد - كهرباء',         'electrical',  5, 'حي النقيب',     'كربلاء', 'verified', true,  'كهربائي، أشتغل صيانة يومية وتأسيس شقق.', 32.5998, 44.0102),
 ( 8, 'مرتضى نعمة',      'مرتضى نعمة',               'electrical', 11, 'الحر',          'الحر',   'needs_info', false, 'كهربائي وفني منظومات طاقة شمسية.', 32.6501, 43.9750),
 ( 9, 'محمد رضا',        'محمد رضا للتبريد',          'ac',         10, 'حي الموظفين',   'كربلاء', 'verified', true,  'فني سبلتات، تعبئة غاز وتنظيف ونصب. أشتغل كل الماركات.', 32.6290, 44.0170),
 (10, 'سجاد عدنان',      'سجاد عدنان',               'ac',          7, 'حي رمضان',      'كربلاء', 'verified', true,  'تبريد وتكييف، صيانة سبلت ومبردات هواء. أجيك بنفس اليوم.', 32.6050, 44.0480),
 (11, 'حسنين ماجد',      'حسنين ماجد - تكييف',        'ac',          4, 'حي البلدية',    'كربلاء', 'verified', false, 'نصب وفتح سبلتات وتنظيف كامل.', 32.6101, 44.0222),
 (12, 'أمير عبد الحسين', 'أمير عبد الحسين',          'ac',         13, 'حي الحسين',     'كربلاء', 'verified', true,  'خبرة 13 سنة بالتبريد والتكييف المركزي والسبلت.', 32.6140, 44.0390),
 (13, 'علي جواد',        'علي جواد للأجهزة',          'appliances',  9, 'حي العامل',     'كربلاء', 'verified', true,  'تصليح غسالات وثلاجات ومجمدات بالبيت. قطع أصلية.', 32.5960, 44.0300),
 (14, 'حسن مهدي',        'حسن مهدي',                 'appliances',  6, 'حي الحسين',     'كربلاء', 'verified', true,  'صيانة طباخات وأفران وسخانات كهربائية وغازية.', 32.6160, 44.0420),
 (15, 'يوسف قاسم',       'يوسف قاسم - صيانة',         'appliances',  2, 'حي الغدير',     'كربلاء', 'unverified', false, 'فني صيانة أجهزة منزلية.', 32.6350, 44.0050),
 (16, 'باقر عزيز',       'باقر عزيز',                'appliances', 14, 'حي العباس',     'كربلاء', 'verified', false, 'متخصص غسالات أوتوماتيك وثلاجات نوفروست.', 32.6230, 44.0320),
 (17, 'ضياء ناصر',       'ضياء ناصر للنجارة',         'carpentry',  18, 'حي النقيب',     'كربلاء', 'verified', true,  'نجار من 18 سنة. مطابخ، أبواب، كبتات وتصليح أثاث.', 32.6010, 44.0090),
 (18, 'مهدي صالح',       'مهدي صالح',                'carpentry',   7, 'حي الموظفين',   'كربلاء', 'verified', true,  'تصليح أبواب وأقفال وتفصيل كاونترات.', 32.6280, 44.0160),
 (19, 'عمار ستار',       'عمار ستار - نجارة',         'carpentry',  10, 'حي رمضان',      'كربلاء', 'pending', false, 'نجارة خشب وMDF، تفصيل غرف نوم ومطابخ.', 32.6060, 44.0470),
 (20, 'حسين علي',        'حسين علي',                 'carpentry',   5, 'حي البلدية',    'كربلاء', 'verified', false, 'نجار تصليحات سريعة بالبيوت.', 32.6095, 44.0210);

select pg_temp.demo_user(('00000000-0000-4000-b000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                         'provider' || lpad(n::text, 2, '0') || '@demo.fanni.test', name,
                         '0781000' || lpad(n::text, 4, '0'), 'provider')
from demo_providers;

update public.users u set city = d.city, area = d.area
from demo_providers d
where u.id = ('00000000-0000-4000-b000-0000000000' || lpad(d.n::text, 2, '0'))::uuid;

insert into public.providers (
  id, display_name, service_id, years_experience, bio, province, city, area, lat, lng,
  verification_status, verified_at, is_available, is_demo, created_at
)
select ('00000000-0000-4000-b000-0000000000' || lpad(d.n::text, 2, '0'))::uuid,
       d.display_name, s.id, d.years, d.bio, 'كربلاء', d.city, d.area, d.lat, d.lng,
       d.status, case when d.status = 'verified' then now() - interval '90 days' end,
       d.available, true, now() - (d.n || ' days')::interval - interval '100 days'
from demo_providers d join public.services s on s.slug = d.service;

-- Test providers: one verified plumber in Hay Al-Hussein, one waiting for approval
insert into public.providers (id, display_name, service_id, years_experience, bio, province, city, area, lat, lng,
                              verification_status, verified_at, is_available, is_demo)
select '00000000-0000-4000-a000-000000000003', 'حيدر كاظم للسباكة', s.id, 8,
       'حساب تجريبي للفني. سباكة عامة، تسريبات وسخانات.', 'كربلاء', 'كربلاء', 'حي الحسين', 32.6155, 44.0400,
       'verified', now() - interval '60 days', true, true
from public.services s where s.slug = 'plumbing';

insert into public.providers (id, display_name, service_id, years_experience, bio, province, city, area,
                              verification_status, is_available, is_demo)
select '00000000-0000-4000-a000-000000000004', 'سيف علي للكهرباء', s.id, 4,
       'حساب تجريبي لفني ينتظر التوثيق.', 'كربلاء', 'كربلاء', 'حي العامل', 'pending', false, true
from public.services s where s.slug = 'electrical';

update public.users u set city = p.city, area = p.area from public.providers p
where u.id = p.id and u.id in ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004');

-- Verification requests (documents are placeholders; real ones live in the private bucket)
insert into public.verification_requests (provider_id, document_path, provider_note, status, admin_notes, reviewed_by, reviewed_at, is_demo, created_at)
select p.id, p.id || '/demo-id-card.png', 'هوية الأحوال المدنية',
       case p.verification_status when 'unverified' then 'pending' else p.verification_status end,
       case p.verification_status
         when 'verified'   then 'تم التحقق من الهوية'
         when 'needs_info' then 'الصورة مو واضحة، ارفع صورة أوضح للهوية من الوجهين'
       end,
       case when p.verification_status in ('verified', 'needs_info') then '00000000-0000-4000-a000-000000000001'::uuid end,
       case when p.verification_status in ('verified', 'needs_info') then now() - interval '80 days' end,
       true, now() - interval '95 days'
from public.providers p
where p.verification_status <> 'unverified';

-- Portfolio placeholders (static SVGs shipped with the web app under /demo/portfolio)
insert into public.provider_portfolio (provider_id, image_url, caption, is_demo)
select p.id, '/demo/portfolio/' || s.slug || '-' || i || '.svg',
       (array['شغل بأحد البيوت بكربلاء', 'قبل وبعد التصليح', 'تأسيس جديد'])[i], true
from public.providers p
join public.services s on s.id = p.service_id
cross join generate_series(1, 3) i
where p.is_demo;

-- ---------------------------------------------------------------------
-- Demo request history: finished + rated jobs for every verified provider
-- ---------------------------------------------------------------------
create temp table review_pool (i int, rating int, comment text);
insert into review_pool values
 (1, 5, 'خوش فني، إجا بالوقت وخلص الشغل بسرعة. أنصح بيه'),
 (2, 5, 'شغله نظيف ومرتب وتعامله راقي. الله يوفقه'),
 (3, 4, 'الشغل زين بس تأخر شوية عن الموعد'),
 (4, 5, 'سعره مناسب وما غشنا بالقطع. شكراً'),
 (5, 4, 'شغل ممتاز، بس لو يجيب عدته كاملة من أول مرة'),
 (6, 5, 'أفضل فني تعاملت وياه، صادق ويفهم بشغله'),
 (7, 3, 'الشغل مقبول بس السعر شوية عالي'),
 (8, 5, 'حل المشكلة اللي محد گدر يحلها. تسلم إيده'),
 (9, 4, 'محترم ومرتب، أكيد راح أرجعله');

do $$
declare
  p record;
  v_req uuid;
  v_n int;
  v_k int := 0;
  v_customer uuid;
  v_rev record;
  v_date timestamptz;
begin
  perform setseed(0.42);
  for p in
    select pr.id, pr.service_id, pr.city, pr.area, s.problem_types
    from public.providers pr join public.services s on s.id = pr.service_id
    where pr.is_demo and pr.verification_status = 'verified'
    order by pr.id
  loop
    v_n := 2 + floor(random() * 4)::int;   -- 2..5 finished jobs each
    for j in 1..v_n loop
      v_k := v_k + 1;
      v_customer := ('00000000-0000-4000-c000-00000000000' || (1 + (v_k % 5)))::uuid;
      v_date := now() - ((5 + floor(random() * 80)) || ' days')::interval;
      select * into v_rev from review_pool where i = 1 + (v_k % 9);

      insert into public.service_requests (
        customer_id, service_id, problem_type, description, province, city, area,
        time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at
      ) values (
        v_customer, p.service_id, p.problem_types[1 + (v_k % (array_length(p.problem_types, 1) - 1))],
        'طلب تجريبي منتهي', 'كربلاء', p.city, p.area,
        'today', 'RATED', p.id, v_date + interval '20 minutes', v_date + interval '3 hours', true, v_date
      ) returning id into v_req;

      insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo, created_at)
      values (v_req, p.id, 'accepted', v_date + interval '20 minutes', true, v_date);

      insert into public.reviews (
        request_id, provider_id, customer_id, customer_name, rating,
        rating_punctuality, rating_quality, rating_behavior, rating_price, comment, is_demo, created_at
      )
      select v_req, p.id, v_customer, split_part(u.full_name, ' ', 1), v_rev.rating,
             greatest(1, v_rev.rating - (v_k % 2)), v_rev.rating, 5, greatest(1, v_rev.rating - (v_k % 3 = 0)::int),
             v_rev.comment, true, v_date + interval '5 hours'
      from public.users u where u.id = v_customer;

      update public.providers set completed_jobs = completed_jobs + 1 where id = p.id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Live demo requests for the test accounts (one per interesting status)
-- ---------------------------------------------------------------------
do $$
declare
  c_test   uuid := '00000000-0000-4000-a000-000000000002';  -- customer@fanni.test
  p_test   uuid := '00000000-0000-4000-a000-000000000003';  -- provider@fanni.test (plumber)
  s_plumb  uuid := (select id from public.services where slug = 'plumbing');
  s_elec   uuid := (select id from public.services where slug = 'electrical');
  s_ac     uuid := (select id from public.services where slug = 'ac');
  s_carp   uuid := (select id from public.services where slug = 'carpentry');
  v_req    uuid;
begin
  -- 1) MATCHING: test customer sent a plumbing request to test provider + 1 other (provider inbox has an offer)
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    address_details, time_slot, status, is_demo, created_at)
  values (c_test, s_plumb, 'تسريب مي', 'اكو تسريب مي جوة المغسلة بالحمام والمي دا ينزل عالكاشي',
    'كربلاء', 'كربلاء', 'حي الحسين', 'قرب جامع الحسين، الفرع الثاني', 'today', 'MATCHING', true, now() - interval '25 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, is_demo, created_at) values
    (v_req, p_test, 'offered', true, now() - interval '20 minutes'),
    (v_req, '00000000-0000-4000-b000-000000000002', 'offered', true, now() - interval '20 minutes');

  -- 2) IN_PROGRESS: electrician working at test customer's house
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, is_demo, created_at)
  values (c_test, s_elec, 'انقطاع بجزء من البيت', 'الكهرباء طافية بغرفتين والصالة شغالة',
    'كربلاء', 'كربلاء', 'حي الحسين', 'now', 'IN_PROGRESS', '00000000-0000-4000-b000-000000000005',
    now() - interval '2 hours', true, now() - interval '150 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, '00000000-0000-4000-b000-000000000005', 'accepted', now() - interval '2 hours', true);

  -- 3) COMPLETED (not rated yet): test customer can rate it / file a complaint
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at)
  values (c_test, s_ac, 'تعبئة غاز', 'السبلت يشتغل بس ما يبرد زين',
    'كربلاء', 'كربلاء', 'حي الحسين', 'tomorrow', 'COMPLETED', '00000000-0000-4000-b000-000000000009',
    now() - interval '2 days', now() - interval '1 day', true, now() - interval '3 days')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, '00000000-0000-4000-b000-000000000009', 'accepted', now() - interval '2 days', true);
  update public.providers set completed_jobs = completed_jobs + 1 where id = '00000000-0000-4000-b000-000000000009';

  -- 4) CANCELLED
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, cancel_reason, cancelled_at, is_demo, created_at)
  values (c_test, s_carp, 'تصليح باب', 'باب غرفة النوم ما يتسكر', 'كربلاء', 'كربلاء', 'حي الحسين',
    'today', 'CANCELLED', 'انحلت المشكلة', now() - interval '6 days', true, now() - interval '6 days');

  -- 5) ACCEPTED job for the test provider (from another demo customer) — provider can move it forward
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    address_details, time_slot, status, provider_id, accepted_at, is_demo, created_at)
  values ('00000000-0000-4000-c000-000000000001', s_plumb, 'انسداد مجاري', 'مجرى المطبخ مسدود والمي راجعة',
    'كربلاء', 'كربلاء', 'حي العباس', 'قرب مدرسة العباس الابتدائية', 'now', 'ACCEPTED', p_test,
    now() - interval '10 minutes', true, now() - interval '40 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, p_test, 'accepted', now() - interval '10 minutes', true);

  -- 6) A rated job in the test provider's history (shows on their public profile)
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at)
  values ('00000000-0000-4000-c000-000000000003', s_plumb, 'مشكلة بالسخان', 'السخان ما يسخن',
    'كربلاء', 'كربلاء', 'حي الموظفين', 'today', 'RATED', p_test,
    now() - interval '9 days', now() - interval '9 days', true, now() - interval '10 days')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, p_test, 'accepted', now() - interval '9 days', true);
  insert into public.reviews (request_id, provider_id, customer_id, customer_name, rating,
    rating_punctuality, rating_quality, rating_behavior, rating_price, comment, is_demo)
  values (v_req, p_test, '00000000-0000-4000-c000-000000000003', 'فاطمة', 5, 5, 5, 5, 4,
    'بدل المقاومة وصار السخان يشتغل. شغل نظيف', true);
  update public.providers set completed_jobs = completed_jobs + 1 where id = p_test;
end $$;

-- ---------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------
insert into public.complaints (request_id, customer_id, provider_id, subject, details, status, admin_notes, is_demo, created_at)
select r.id, r.customer_id, r.provider_id, 'الفني تأخر ساعتين',
       'اتفقنا الساعة 10 وإجا الساعة 12 بدون ما يتصل', 'in_review', 'تواصلنا ويا الفني وبانتظار رده', true, r.completed_at + interval '1 day'
from public.service_requests r where r.is_demo and r.status = 'RATED' order by r.created_at limit 1;

insert into public.complaints (request_id, customer_id, provider_id, subject, details, status, is_demo, created_at)
select r.id, r.customer_id, r.provider_id, 'السعر أعلى من المتفق عليه',
       'گال 25 ألف وبعدين طلب 40', 'open', true, r.completed_at + interval '2 hours'
from public.service_requests r where r.is_demo and r.status = 'RATED' order by r.created_at desc limit 1 offset 3;

select set_config('fanni.system', 'off', false);

-- Quick summary
select
  (select count(*) from public.providers where is_demo) as demo_providers,
  (select count(*) from public.providers where verification_status = 'verified') as verified,
  (select count(*) from public.service_requests) as requests,
  (select count(*) from public.reviews) as reviews,
  (select count(*) from public.provider_portfolio) as portfolio,
  (select count(*) from public.complaints) as complaints;
