import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Briefcase, CalendarDays, MapPin, Award, Share2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { must, useLoad } from '../../lib/useLoad';
import type { PortfolioItem, Provider, Review } from '../../lib/types';
import { REVIEW_ASPECTS } from '../../lib/constants';
import { formatDate, timeAgo } from '../../lib/utils';
import {
  AvailableBadge, Avatar, DemoBadge, EmptyState, ErrorBox, LinkButton, PageHeader, Spinner, Stars, Stat, VerifiedBadge,
} from '../../components/ui';

/** Share link /p/<code> -> the provider's public profile. */
export function ProviderByCode() {
  const { code } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    if (!/^\d{1,9}$/.test(code ?? '')) return null;
    return must(await supabase.from('providers').select('id').eq('public_code', Number(code)).maybeSingle()) as { id: string } | null;
  }, [code]);
  if (loading) return <Spinner className="pt-32" />;
  if (error) return <div className="pt-6"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) {
    return (
      <div className="pt-6">
        <PageHeader title="الفني" back="/" />
        <EmptyState title="هذا الفني ما موجود أو غير متاح حالياً" />
      </div>
    );
  }
  return <ProviderProfile id={data.id} />;
}

async function shareProfile(name: string, code: number) {
  const url = `${window.location.origin}/p/${code}`;
  const text = `${name} على تطبيق «فني» 🔧`;
  if (navigator.share) {
    try { await navigator.share({ title: text, text, url }); return; } catch { return; }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`, '_blank', 'noreferrer');
}

export default function ProviderProfile({ id: idProp }: { id?: string }) {
  const params = useParams();
  const id = idProp ?? params.id;
  const [lightbox, setLightbox] = useState<PortfolioItem | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const [p, portfolio, reviews, punct] = await Promise.all([
      supabase.from('providers').select('*, services(id, slug, name_ar, icon)').eq('id', id!).maybeSingle(),
      supabase.from('provider_portfolio').select('*').eq('provider_id', id!).order('created_at', { ascending: false }),
      supabase.from('reviews').select('*').eq('provider_id', id!).eq('is_hidden', false)
        .order('created_at', { ascending: false }).limit(30),
      supabase.rpc('provider_punctuality', { p_provider_id: id! }),
    ]);
    return {
      provider: must(p) as Provider | null,
      portfolio: must(portfolio) as PortfolioItem[],
      reviews: must(reviews) as Review[],
      // older databases without the ETA update simply show nothing
      punctuality: ((punct.data as { trips: number; on_time: number }[] | null) ?? [])[0] ?? null,
    };
  }, [id]);

  if (loading) return <Spinner className="pt-32" />;
  if (error) return <div className="pt-6"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data?.provider) {
    return (
      <div className="pt-6">
        <PageHeader title="الفني" back />
        <EmptyState title="هذا الفني ما موجود أو غير متاح حالياً" />
      </div>
    );
  }
  const { provider: p, portfolio, reviews, punctuality } = data;

  const aspectAvg = (key: (typeof REVIEW_ASPECTS)[number]['key']) => {
    const vals = reviews.map((r) => r[key]).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  return (
    <div className="pb-36">
      <PageHeader
        title="ملف الفني"
        back
        action={
          <button
            onClick={() => shareProfile(p.display_name, p.public_code)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-card"
            aria-label="مشاركة"
          >
            <Share2 className="h-5 w-5" />
          </button>
        }
      />

      <div className="rounded-3xl bg-white p-5 text-center shadow-card">
        <div className="flex justify-center">
          <Avatar name={p.display_name} url={p.avatar_url} size={88} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-ink">{p.display_name}</h1>
        <p className="text-gray-500">{p.services?.name_ar}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {p.verification_status === 'verified' && <VerifiedBadge />}
          <AvailableBadge available={p.is_available} />
          <DemoBadge show={p.is_demo} />
        </div>
        {punctuality && punctuality.trips >= 3 && (
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700">
            ⏱️ وصل بالوقت {punctuality.on_time} من {punctuality.trips} مرات
          </p>
        )}
        {p.is_demo && (
          <p className="mt-3 rounded-xl bg-accent-50 p-2 text-xs text-accent-600">
            هذا ملف تجريبي لأغراض الاختبار، مو فني حقيقي.
          </p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat
          label={`${p.rating_count} تقييم`}
          value={p.rating_count ? Number(p.rating_avg).toFixed(1) : '—'}
          icon={<Award className="h-5 w-5" />}
        />
        <Stat label="شغلة مكتملة" value={p.completed_jobs} icon={<Briefcase className="h-5 w-5" />} />
        <Stat label="سنين خبرة" value={p.years_experience} icon={<CalendarDays className="h-5 w-5" />} />
      </div>

      <div className="mt-3 space-y-2 rounded-3xl bg-white p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin className="h-4 w-4 text-primary" /> {p.area}، {p.city}، {p.province}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <CalendarDays className="h-4 w-4 text-primary" /> ويانا من {formatDate(p.created_at)}
        </div>
        {p.bio && <p className="pt-2 leading-7 text-ink">{p.bio}</p>}
      </div>

      {/* Portfolio */}
      <h2 className="mb-3 mt-6 font-bold text-ink">معرض الأعمال</h2>
      {portfolio.length ? (
        <div className="grid grid-cols-3 gap-2">
          {portfolio.map((it) => (
            <button key={it.id} onClick={() => setLightbox(it)} className="aspect-square overflow-hidden rounded-2xl bg-gray-100">
              <img src={it.image_url} alt={it.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="ما مضاف صور أعمال بعد" />
      )}

      {/* Reviews */}
      <h2 className="mb-3 mt-6 font-bold text-ink">تقييمات الزبائن</h2>
      {reviews.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-3xl bg-white p-4 shadow-card">
          {REVIEW_ASPECTS.map((a) => {
            const v = aspectAvg(a.key);
            return (
              <div key={a.key} className="text-sm">
                <div className="text-gray-500">{a.label}</div>
                {v != null ? <Stars value={v} size={14} /> : <span className="text-gray-400">—</span>}
              </div>
            );
          })}
        </div>
      )}
      {reviews.length ? (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-3xl bg-white p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{r.customer_name || 'زبون'}</span>
                <Stars value={r.rating} size={14} />
              </div>
              {r.comment && <p className="mt-2 text-sm leading-6 text-gray-700">{r.comment}</p>}
              <p className="mt-2 text-xs text-gray-400">{timeAgo(r.created_at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="ما عنده تقييمات بعد" text="التقييم يصير بس من زبائن خلصوا شغلهم ويا الفني." />
      )}

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-[104px] z-20 mx-auto max-w-xl px-4">
        <LinkButton to={`/request/new?service=${p.services?.slug}&provider=${p.id}`} variant="accent" full className="shadow-lg">
          طلب الخدمة من {p.display_name.split(' ')[0]}
        </LinkButton>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4" onClick={() => setLightbox(null)}>
          <button className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="إغلاق">
            <X className="h-6 w-6" />
          </button>
          <img src={lightbox.image_url} alt="" className="max-h-[80vh] max-w-full rounded-2xl" />
          {lightbox.caption && <p className="mt-3 text-white">{lightbox.caption}</p>}
        </div>
      )}
    </div>
  );
}
