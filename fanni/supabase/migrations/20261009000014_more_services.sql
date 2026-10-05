-- =====================================================================
-- Four more services (visible right away): solar, cameras/satellite/
-- internet, builder, water filters. 12 services fill the home grid
-- exactly (3 or 4 per row). Existing rows are left untouched.
-- Idempotent: safe to run more than once.
-- =====================================================================

insert into public.services (slug, name_ar, icon, description_ar, sort_order, problem_types) values
('solar', 'طاقة شمسية', 'solar-panel', 'نصب منظومات، ألواح، بطاريات وانفرترات', 9,
  array['نصب منظومة جديدة', 'المنظومة ما تشحن', 'تنظيف ألواح', 'بطاريات أو انفرتر', 'توسيع المنظومة', 'شي ثاني']),
('cctv', 'كاميرات وستلايت', 'cctv', 'كاميرات مراقبة، ستلايت، انترنت وراوترات', 10,
  array['نصب كاميرات مراقبة', 'الكاميرات ما تشتغل', 'نصب أو توجيه ستلايت', 'مشكلة بالانترنت أو الراوتر', 'تمديد شبكة', 'شي ثاني']),
('construction', 'عامل بناء', 'brick-wall', 'بناء، لياسة، كاشي وترميم', 11,
  array['بناء جدار أو غرفة', 'لياسة', 'تركيب كاشي أو سيراميك', 'ترميم وتشققات', 'صب وأعمال كونكريت', 'شي ثاني']),
('water-filters', 'فلاتر وتحلية مي', 'glass-water', 'فلاتر RO، منظومات تحلية وتنظيف خزانات', 12,
  array['نصب فلتر أو منظومة تحلية', 'تبديل شمعات', 'الفلتر ما يطلع مي', 'تسريب بالفلتر', 'تنظيف خزان', 'شي ثاني'])
on conflict (slug) do nothing;
