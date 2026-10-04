import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Search, ShieldCheck, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { Provider, Service, ServiceRequest } from '../../lib/types';
import { PROVINCE } from '../../lib/constants';
import { ServiceBadge } from '../../components/ServiceIcon';
import { ProviderCard, RequestCard } from '../../components/cards';
import { ErrorBox, Spinner } from '../../components/ui';
import { Logo } from '../../components/Logo';
import heroImg from '../../assets/hero-electrician.webp';

export default function Home() {
  const { profile } = useAuth();
  const [q, setQ] = useState('');

  const services = useLoad(async () =>
    must(await supabase.from('services').select('*').eq('is_active', true).order('sort_order')) as Service[],
  );

  const myRequests = useLoad(async () => {
    if (!profile || profile.role !== 'customer') return [] as ServiceRequest[];
    return must(
      await supabase
        .from('service_requests')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('customer_id', profile.id)
        .not('status', 'in', '(CANCELLED,RATED)')
        .order('created_at', { ascending: false })
        .limit(3),
    ) as ServiceRequest[];
  }, [profile?.id]);

  // "Nearby": available + verified, same area first, then same city, then rating
  const nearby = useLoad(async () => {
    const rows = must(
      await supabase
        .from('providers')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('verification_status', 'verified')
        .eq('province', PROVINCE)
        .eq('is_available', true)
        .order('rating_avg', { ascending: false })
        .limit(30),
    ) as Provider[];
    const score = (p: Provider) =>
      (profile?.area && p.area === profile.area ? 2 : 0) + (profile?.city && p.city === profile.city ? 1 : 0);
    return rows.sort((a, b) => score(b) - score(a)).slice(0, 5);
  }, [profile?.area]);

  const filtered = useMemo(() => {
    const list = services.data ?? [];
    const term = q.trim();
    if (!term) return list;
    return list.filter(
      (s) =>
        s.name_ar.includes(term) ||
        s.description_ar?.includes(term) ||
        s.problem_types.some((p) => p.includes(term)),
    );
  }, [services.data, q]);

  const firstName = profile?.full_name?.split(' ')[0];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative -mx-4 overflow-hidden rounded-b-[2rem] bg-primary px-5 pb-6 pt-6 text-white">
        {/* photo (subject on the left, away from the RTL text) + navy wash for legibility */}
        <img src={heroImg} alt="" aria-hidden="true" fetchPriority="high"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[94%_30%] opacity-90" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary from-25% via-primary/80 to-primary/30" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-primary/90 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-primary/75 to-transparent" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm text-white/70">
            <MapPin className="h-4 w-4" /> {profile?.area ? `${profile.area}، ` : ''}{PROVINCE}
          </div>
          <Logo size={34} light />
        </div>
        <h1 className="relative mt-5 animate-fade-up text-[26px] font-extrabold leading-snug drop-shadow-sm">
          {firstName ? `هلا ${firstName}،` : 'هلا بيك،'}
          <br />
          شنو تحتاج اليوم؟
        </h1>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دوّر على خدمة… مثلاً: تسريب، سبلت، غسالة"
            className="w-full rounded-2xl bg-white py-4 pe-4 ps-12 text-base text-ink shadow-lg shadow-black/20 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-accent/30"
          />
        </div>
      </section>

      {/* Services */}
      <section>
        <h2 className="mb-3 text-base font-bold text-ink">اختار الخدمة</h2>
        {services.loading ? (
          <Spinner />
        ) : (
          <>
            <ErrorBox message={services.error} onRetry={services.reload} />
            <div className="stagger grid grid-cols-3 gap-3 sm:grid-cols-4">
              {filtered.map((s) => (
                <Link
                  key={s.id}
                  to={`/services/${s.slug}`}
                  className="pressable group flex flex-col items-center gap-2.5 rounded-[28px] bg-white px-2 pb-4 pt-5 text-center shadow-card ring-1 ring-black/[.03] transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <ServiceBadge icon={s.icon} size={58} className="transition-transform duration-300 group-hover:scale-105" />
                  <span className="text-[13px] font-bold leading-tight text-ink">{s.name_ar}</span>
                </Link>
              ))}
            </div>
            {!filtered.length && !services.error && (
              <p className="py-6 text-center text-sm text-gray-500">ماكو خدمة بهالاسم. جرّب كلمة ثانية.</p>
            )}
          </>
        )}
      </section>

      {/* My requests */}
      {!!myRequests.data?.length && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-ink">طلباتي</h2>
            <Link to="/requests" className="flex items-center text-sm font-semibold text-primary">
              الكل <ChevronLeft className="h-4 w-4" />
            </Link>
          </div>
          <div className="stagger space-y-3">
            {myRequests.data.map((r) => (
              <RequestCard key={r.id} r={r} to={`/requests/${r.id}`} />
            ))}
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card">
        <ShieldCheck className="h-10 w-10 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-bold text-ink">فنيين موثقين بس</p>
          <p className="text-gray-500">نراجع هوية كل فني قبل ما يستلم طلبات، والتقييمات من زبائن خلصوا شغلهم فعلاً.</p>
        </div>
      </section>

      {/* Nearby providers */}
      <section>
        <h2 className="mb-3 text-base font-bold text-ink">فنيين قريبين منك</h2>
        {nearby.loading ? (
          <Spinner />
        ) : (
          <div className="stagger space-y-3">
            {(nearby.data ?? []).map((p) => (
              <ProviderCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      {!profile && (
        <Link
          to="/register?role=provider"
          className="block rounded-3xl border-2 border-dashed border-accent/40 bg-accent-50 p-4 text-center text-sm font-semibold text-accent-600"
        >
          إنت فني؟ سجّل وخلّي الزبائن يوصلولك 👷
        </Link>
      )}
    </div>
  );
}
