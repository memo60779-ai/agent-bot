import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Award, Briefcase, Inbox, MapPin, Star, Wrench } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { OfferRow, Review, ServiceRequest } from '../../lib/types';
import { TIME_SLOT_LABEL } from '../../lib/constants';
import { cn, errorMessage, timeAgo } from '../../lib/utils';
import { StatusBadge } from '../../components/cards';
import { Badge, DemoBadge, EmptyState, ErrorBox, Spinner, Stars, Stat } from '../../components/ui';
import { VerificationPanel } from './shared';
import { TelegramCard } from './TelegramCard';
import { InstallBanner } from '../../components/InstallApp';

type Tab = 'new' | 'active' | 'history';

export default function ProviderDashboard() {
  const { provider, profile, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('new');
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = useLoad(async () => {
    if (!provider) return null;
    const [offers, jobs, reviews] = await Promise.all([
      supabase.from('provider_requests')
        .select('*, service_requests(*, services(id, slug, name_ar, icon))')
        .eq('provider_id', provider.id).eq('status', 'offered')
        .order('created_at', { ascending: false }),
      supabase.from('service_requests')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('provider_id', provider.id)
        .order('updated_at', { ascending: false }).limit(50),
      supabase.from('reviews').select('*').eq('provider_id', provider.id),
    ]);
    return {
      offers: (must(offers) as OfferRow[]).filter((o) => ['NEW', 'MATCHING'].includes(o.service_requests?.status ?? '')),
      jobs: must(jobs) as ServiceRequest[],
      reviews: must(reviews) as Review[],
    };
  }, [provider?.id]);

  // live inbox
  useEffect(() => {
    if (!provider) return;
    const ch = supabase
      .channel(`inbox-${provider.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_requests', filter: `provider_id=eq.${provider.id}` }, () => data.reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [provider?.id]); // eslint-disable-line

  if (!provider) return <Navigate to="/provider/onboarding" replace />;

  const verified = provider.verification_status === 'verified';
  const active = data.data?.jobs.filter((j) => ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(j.status)) ?? [];
  const history = data.data?.jobs.filter((j) => ['COMPLETED', 'RATED', 'CANCELLED'].includes(j.status)) ?? [];
  const reviewsByReq = new Map((data.data?.reviews ?? []).map((r) => [r.request_id, r]));

  async function toggleAvailable() {
    setToggling(true);
    setError(null);
    const { error } = await supabase.from('providers').update({ is_available: !provider!.is_available }).eq('id', provider!.id);
    if (error) setError(errorMessage(error));
    await refresh();
    setToggling(false);
  }

  return (
    <div className="space-y-4">
      <section className="-mx-4 rounded-b-[2rem] bg-primary px-5 pb-5 pt-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/70">هلا {profile?.full_name.split(' ')[0]} 👋</p>
            <h1 className="text-xl font-bold">{provider.display_name}</h1>
            <p className="text-sm text-white/70">{provider.services?.name_ar} · {provider.area}</p>
          </div>
          <DemoBadge show={provider.is_demo} />
        </div>

        {/* Available Now */}
        <button
          onClick={toggleAvailable}
          disabled={!verified || toggling}
          className={cn(
            'mt-5 flex w-full items-center justify-between rounded-2xl p-4 text-start transition disabled:opacity-60',
            provider.is_available ? 'bg-emerald-500' : 'bg-white/10',
          )}
        >
          <div>
            <p className="font-bold">{provider.is_available ? 'متاح الآن' : 'غير متاح'}</p>
            <p className="text-sm text-white/80">
              {!verified ? 'تتفعل بعد توثيق حسابك' : provider.is_available ? 'تطلع للزبائن بأول القائمة' : 'شغّلها حتى توصلك طلبات أكثر'}
            </p>
          </div>
          <span className={cn('relative h-8 w-14 rounded-full transition', provider.is_available ? 'bg-white' : 'bg-white/30')}>
            <span className={cn('absolute top-1 h-6 w-6 rounded-full transition-all',
              provider.is_available ? 'start-7 bg-emerald-500' : 'start-1 bg-white')} />
          </span>
        </button>
      </section>

      <ErrorBox message={error ?? data.error} />
      {!verified && <VerificationPanel />}
      <TelegramCard />
      <InstallBanner text="ثبّت «فني» حتى توصل لطلباتك بضغطة وحدة" />

      <div className="grid grid-cols-3 gap-3">
        <Stat label={`${provider.rating_count} تقييم`} value={provider.rating_count ? Number(provider.rating_avg).toFixed(1) : '—'} icon={<Star className="h-5 w-5" />} />
        <Stat label="شغلة مكتملة" value={provider.completed_jobs} icon={<Briefcase className="h-5 w-5" />} />
        <Stat label="شغل حالي" value={active.length} icon={<Wrench className="h-5 w-5" />} />
      </div>

      <div className="flex rounded-2xl bg-white p-1 shadow-card">
        {([
          ['new', `جديدة${data.data?.offers.length ? ` (${data.data.offers.length})` : ''}`],
          ['active', `الحالي${active.length ? ` (${active.length})` : ''}`],
          ['history', 'السجل'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 rounded-xl py-2.5 text-sm font-semibold', tab === t ? 'bg-primary text-white' : 'text-gray-500')}>
            {label}
          </button>
        ))}
      </div>

      {data.loading && !data.data ? <Spinner /> : (
        <div className="stagger space-y-3">
          {tab === 'new' && (data.data?.offers.length ? data.data.offers.map((o) => {
            const r = o.service_requests!;
            return (
              <Link key={o.id} to={`/requests/${r.id}`} className="block rounded-3xl border-2 border-accent/30 bg-white p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">{r.problem_type}</span>
                  <Badge tone="orange">{TIME_SLOT_LABEL[r.time_slot]}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-gray-600">{r.description}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.area}، {r.city}</span>
                  <span>{timeAgo(o.created_at)}</span>
                </div>
                <div className="mt-3 rounded-xl bg-accent py-2.5 text-center text-sm font-bold text-white">شوف الطلب وردّ</div>
              </Link>
            );
          }) : (
            <EmptyState icon={<Inbox className="h-10 w-10" />} title="ماكو طلبات جديدة هسه"
              text={verified ? (provider.is_available ? 'أول ما يدزلك زبون طلب يطلع هنا.' : 'شغّل "متاح الآن" حتى تطلع للزبائن أول.') : 'وثّق حسابك حتى تبدي تستلم طلبات.'} />
          ))}

          {tab === 'active' && (active.length ? active.map((r) => <JobRow key={r.id} r={r} />) : (
            <EmptyState icon={<Wrench className="h-10 w-10" />} title="ماكو شغل حالي" />
          ))}

          {tab === 'history' && (history.length ? history.map((r) => <JobRow key={r.id} r={r} review={reviewsByReq.get(r.id)} />) : (
            <EmptyState icon={<Award className="h-10 w-10" />} title="بعد ما عندك سجل" text="الشغل المكتمل وتقييماته يطلع هنا." />
          ))}
        </div>
      )}
    </div>
  );
}

function JobRow({ r, review }: { r: ServiceRequest; review?: Review }) {
  return (
    <Link to={`/requests/${r.id}`} className="block rounded-3xl bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-ink">{r.problem_type}</span>
        <StatusBadge status={r.status} />
      </div>
      <p className="mt-1 text-sm text-gray-500">{r.area} · {timeAgo(r.updated_at)}</p>
      {review && (
        <div className="mt-2 rounded-xl bg-surface p-2.5">
          <Stars value={review.rating} size={14} />
          {review.comment && <p className="mt-1 text-sm text-gray-600">{review.comment}</p>}
        </div>
      )}
    </Link>
  );
}
