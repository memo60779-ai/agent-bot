import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarClock, Check, CheckCircle2, Image as ImageIcon, MapPin, MessageCircle, Phone, RefreshCw, Users, XCircle, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { must, useLoad } from '../lib/useLoad';
import type { Complaint, Contacts, MatchRow, OfferRow, Review, ServiceRequest } from '../lib/types';
import {
  COMPLAINT_LABEL, OFFER_LABEL, REVIEW_ASPECTS, STATUS_FLOW, STATUS_LABEL, TIME_SLOT_LABEL,
} from '../lib/constants';
import { cn, errorMessage, formatDate, signedUrl, telLink, timeAgo, whatsappLink } from '../lib/utils';
import { celebrate, celebrateOnce } from '../lib/confetti';
import { StatusBadge } from '../components/cards';
import { ServiceBadge } from '../components/ServiceIcon';
import { LocationCard } from '../components/LocationMap';
import { PushCard } from '../components/PushCard';
import {
  Avatar, Badge, Button, Card, DemoBadge, EmptyState, ErrorBox, Field, Input, LinkButton, PageHeader, RatingInline,
  Spinner, StarInput, Stars, Textarea, VerifiedBadge,
} from '../components/ui';

export default function RequestDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useLoad(async () => {
    const req = must(
      await supabase
        .from('service_requests')
        .select('*, services(id, slug, name_ar, icon), providers(id, display_name, avatar_url, rating_avg, is_demo)')
        .eq('id', id!)
        .maybeSingle(),
    ) as ServiceRequest | null;
    if (!req) return null;
    const [offers, review, complaints, contacts, photo] = await Promise.all([
      supabase.from('provider_requests')
        .select('*, providers(id, display_name, avatar_url, rating_avg, rating_count, area, is_demo)')
        .eq('request_id', req.id).order('created_at'),
      supabase.from('reviews').select('*').eq('request_id', req.id).maybeSingle(),
      supabase.from('complaints').select('*').eq('request_id', req.id).order('created_at', { ascending: false }),
      supabase.rpc('get_request_contacts', { p_request_id: req.id }),
      req.photo_path ? signedUrl('request-photos', req.photo_path) : Promise.resolve(null),
    ]);
    return {
      req,
      offers: (offers.data ?? []) as OfferRow[],
      review: review.data as Review | null,
      complaints: (complaints.data ?? []) as Complaint[],
      contacts: ((contacts.data as Contacts[] | null) ?? [])[0] ?? null,
      photoUrl: photo,
    };
  }, [id]);

  // Live updates (when Supabase Realtime is enabled for the tables)
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`req-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter: `id=eq.${id}` }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_requests', filter: `request_id=eq.${id}` }, () => reload())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, reload]);

  // 🎉 request sent, and once when a job is completed (customer + provider)
  const sentFlag = params.get('sent');
  const statusNow = data?.req.status;
  useEffect(() => {
    if (!data || !id) return;
    if (sentFlag) celebrateOnce(`sent:${id}`);
    if (statusNow === 'COMPLETED') celebrateOnce(`done:${id}:${profile?.id}`);
  }, [id, sentFlag, statusNow, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setActionError(null);
    const { error: e } = await fn();
    if (e) setActionError(errorMessage(e));
    await reload();
    setBusy(false);
  }

  if (loading && !data) return <Spinner className="pt-32" />;
  if (error) return <div className="pt-6"><ErrorBox message={error} onRetry={reload} /></div>;
  if (!data) return <div className="pt-6"><PageHeader title="الطلب" back /><EmptyState title="الطلب ما موجود أو ما عندك صلاحية تشوفه" /></div>;

  const { req, offers, review, complaints, contacts, photoUrl } = data;
  const isCustomer = profile?.id === req.customer_id;
  const isAssigned = profile?.id === req.provider_id;
  const myOffer = offers.find((o) => o.provider_id === profile?.id);
  const isProviderView = profile?.role === 'provider';
  const isAdmin = profile?.role === 'admin';
  const canCancel = (isCustomer || isAdmin) && ['NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY'].includes(req.status);

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        title="تفاصيل الطلب"
        back
        action={
          <button onClick={reload} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-card" aria-label="تحديث">
            <RefreshCw className={cn('h-5 w-5', loading && 'animate-spin')} />
          </button>
        }
      />

      {params.get('sent') && isCustomer && ['NEW', 'MATCHING'].includes(req.status) && (
        <div className="flex animate-pop items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div>
            <p className="font-bold">تم إرسال طلبك 🎉</p>
            <p className="text-sm">
              {offers.length ? 'طلبك وصل للفني، انتظر موافقته.' : 'اختار فني أو أكثر من القائمة تحت حتى يوصلهم طلبك.'}
            </p>
          </div>
        </div>
      )}

      {/* Customer: get told when a provider accepts / is on the way */}
      {isCustomer && ['NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY'].includes(req.status) && <PushCard audience="customer" />}

      {/* Customer: choose providers first — it's the main action while matching */}
      {isCustomer && ['NEW', 'MATCHING'].includes(req.status) && (
        <Matching req={req} onChange={reload} />
      )}

      {/* Summary */}
      <Card>
        <div className="flex items-start gap-3">
          <ServiceBadge icon={req.services?.icon ?? 'wrench'} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-ink">{req.services?.name_ar}</span>
              <DemoBadge show={req.is_demo} />
            </div>
            <p className="text-sm text-gray-500">{req.problem_type}</p>
          </div>
          <StatusBadge status={req.status} />
        </div>
        <p className="mt-3 leading-7 text-ink">{req.description}</p>
        <div className="mt-3 space-y-1.5 text-sm text-gray-600">
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {req.area}، {req.city}</div>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            {req.time_slot === 'scheduled' && req.scheduled_at ? formatDate(req.scheduled_at, true) : TIME_SLOT_LABEL[req.time_slot]}
            <span className="text-gray-400">· أُرسل {timeAgo(req.created_at)}</span>
          </div>
          {contacts?.address_details && (
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" /> {contacts.address_details}</div>
          )}
          {req.lat != null && contacts?.lat == null && isProviderView && (
            <div className="flex items-center gap-2 font-semibold text-accent-600">
              <MapPin className="h-4 w-4" /> الزبون حدد بيته على الخريطة، يظهرلك بعد ما تقبل
            </div>
          )}
        </div>
        {photoUrl ? (
          <a href={photoUrl} target="_blank" rel="noreferrer" className="mt-3 block">
            <img src={photoUrl} alt="صورة المشكلة" className="h-48 w-full rounded-2xl object-cover" />
          </a>
        ) : req.photo_path ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-400"><ImageIcon className="h-4 w-4" /> الصورة غير متاحة</div>
        ) : null}
      </Card>

      {/* Exact pin: the customer's own, or the assigned provider's after accepting */}
      {contacts?.lat != null && contacts.lng != null && (isAdmin || ['NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(req.status)) && (
        <LocationCard
          point={{ lat: contacts.lat, lng: contacts.lng }}
          title={isCustomer ? 'بيتك على الخريطة' : 'موقع بيت الزبون'}
          sendToPhone={isCustomer ? contacts.provider_phone : null}
        />
      )}

      {/* Timeline */}
      <Timeline req={req} />

      <ErrorBox message={actionError} />

      {/* Contacts after acceptance */}
      {req.provider_id && contacts && ['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'RATED'].includes(req.status) && (
        <Card>
          {isProviderView || isAdmin ? (
            <ContactRow title="الزبون" name={contacts.customer_name} phone={contacts.customer_phone} />
          ) : null}
          {!isProviderView && (
            <ContactRow
              title="الفني"
              name={req.providers?.display_name ?? contacts.provider_name}
              phone={contacts.provider_phone}
              avatar={req.providers?.avatar_url}
              link={`/providers/${req.provider_id}`}
            />
          )}
          <p className="mt-3 rounded-xl bg-surface p-2.5 text-xs text-gray-500">
            اتفقوا على السعر قبل البدء. الدفع مباشرة بين الزبون والفني.
          </p>
        </Card>
      )}

      {/* ---------- Provider actions ---------- */}
      {isProviderView && myOffer?.status === 'offered' && ['NEW', 'MATCHING'].includes(req.status) && (
        <Card className="border-2 border-accent/30">
          <p className="mb-3 font-bold text-ink">طلب جديد إلك 👷</p>
          <p className="mb-4 text-sm text-gray-500">
            الزبون: {contacts?.customer_name ?? '—'} · رقم الزبون يظهر بعد ما تقبل الطلب
          </p>
          <div className="flex gap-2">
            <Button full variant="accent" loading={busy} onClick={() => act(() => supabase.rpc('respond_offer', { p_offer_id: myOffer.id, p_accept: true }))}>
              <Check className="h-5 w-5" /> قبول الطلب
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => act(() => supabase.rpc('respond_offer', { p_offer_id: myOffer.id, p_accept: false }))}>
              اعتذار
            </Button>
          </div>
        </Card>
      )}
      {isProviderView && myOffer && !isAssigned && myOffer.status !== 'offered' && (
        <Card><p className="text-center text-sm text-gray-500">حالة عرضك: {OFFER_LABEL[myOffer.status]}</p></Card>
      )}

      {isAssigned && <ProviderProgress req={req} busy={busy} act={act} />}

      {/* Customer: offers sent */}
      {(isCustomer || isAdmin) && offers.length > 0 && ['NEW', 'MATCHING', 'CANCELLED'].includes(req.status) && (
        <Card>
          <p className="mb-3 font-bold text-ink">الفنيين اللي دزيتلهم الطلب</p>
          <div className="space-y-2">
            {offers.map((o) => (
              <div key={o.id} className="flex items-center gap-3">
                <Avatar name={o.providers?.display_name ?? ''} url={o.providers?.avatar_url} size={36} />
                <span className="flex-1 text-sm font-semibold">{o.providers?.display_name}</span>
                <Badge tone={o.status === 'offered' ? 'orange' : o.status === 'accepted' ? 'green' : 'gray'}>{OFFER_LABEL[o.status]}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Customer: rate */}
      {isCustomer && req.status === 'COMPLETED' && !review && <ReviewForm requestId={req.id} onDone={reload} />}

      {review && (
        <Card>
          <p className="mb-2 font-bold text-ink">التقييم</p>
          <div className="flex items-center gap-2"><Stars value={review.rating} /> <span className="text-sm text-gray-500">{review.rating}/5</span></div>
          {review.comment && <p className="mt-2 text-sm text-gray-700">{review.comment}</p>}
          {review.is_hidden && <p className="mt-2 text-xs text-red-500">هذا التقييم مخفي من الإدارة</p>}
        </Card>
      )}

      {/* Customer: complaints */}
      {isCustomer && ['COMPLETED', 'RATED'].includes(req.status) && (
        <ComplaintBox req={req} complaints={complaints} onDone={reload} />
      )}
      {isAdmin && complaints.length > 0 && (
        <Card>
          <p className="mb-2 font-bold">الشكاوى ({complaints.length})</p>
          {complaints.map((c) => <p key={c.id} className="text-sm">{c.subject} — {COMPLAINT_LABEL[c.status]}</p>)}
        </Card>
      )}

      {/* Cancel */}
      {canCancel && <CancelBox busy={busy} onCancel={(reason) => act(() => supabase.rpc('update_request_status', {
        p_request_id: req.id, p_status: 'CANCELLED', p_reason: reason,
      }))} />}

      {req.status === 'CANCELLED' && (
        <Card className="bg-red-50">
          <p className="flex items-center gap-2 font-semibold text-red-700"><XCircle className="h-5 w-5" /> الطلب ملغي</p>
          {req.cancel_reason && <p className="mt-1 text-sm text-red-600">السبب: {req.cancel_reason}</p>}
          {isCustomer && (
            <LinkButton to={`/request/new?service=${req.services?.slug}`} variant="outline" full className="mt-3">
              اطلب من جديد
            </LinkButton>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Timeline({ req }: { req: ServiceRequest }) {
  if (['CANCELLED', 'NEW', 'MATCHING'].includes(req.status)) return null;
  const current = STATUS_FLOW.indexOf(req.status);
  const pct = (current / (STATUS_FLOW.length - 1)) * 100;
  return (
    <Card>
      <div className="relative">
        {/* track + animated fill (vertical, on the start side) */}
        <div className="absolute bottom-3.5 start-[13px] top-3.5 w-0.5 rounded bg-gray-100" />
        <div className="absolute start-[13px] top-3.5 w-0.5 rounded bg-primary transition-[height] duration-700 ease-out"
          style={{ height: `calc((100% - 28px) * ${pct / 100})` }} />
        <ol className="stagger relative space-y-4">
          {STATUS_FLOW.map((s, i) => {
            const done = i < current;
            const active = i === current;
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={cn(
                    'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-500',
                    done && 'bg-primary text-white',
                    active && 'animate-pulse-ring bg-accent text-white',
                    !done && !active && 'bg-gray-100 text-gray-400',
                  )}
                >
                  {done ? <Check className="h-4 w-4 animate-pop" /> : i + 1}
                </span>
                <span className={cn('text-sm', active ? 'font-extrabold text-ink' : done ? 'text-ink' : 'text-gray-400')}>
                  {STATUS_LABEL[s]}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

function ContactRow({ title, name, phone, avatar, link }: {
  title: string; name: string | null; phone: string | null; avatar?: string | null; link?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Avatar name={name ?? ''} url={avatar} size={44} />
      <div className="flex-1">
        <p className="text-xs text-gray-500">{title}</p>
        {link ? <Link to={link} className="font-bold text-ink underline-offset-2 hover:underline">{name}</Link> : <p className="font-bold text-ink">{name}</p>}
        {phone && <p className="text-sm text-gray-500" dir="ltr">{phone}</p>}
      </div>
      {phone && (
        <div className="flex gap-2">
          <a href={whatsappLink(phone)} target="_blank" rel="noreferrer" className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700" aria-label="واتساب">
            <MessageCircle className="h-5 w-5" />
          </a>
          <a href={telLink(phone)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white" aria-label="اتصال">
            <Phone className="h-5 w-5" />
          </a>
        </div>
      )}
    </div>
  );
}

function ProviderProgress({ req, busy, act }: {
  req: ServiceRequest; busy: boolean; act: (fn: () => PromiseLike<{ error: unknown }>) => Promise<void>;
}) {
  const set = (s: string) => () => act(() => supabase.rpc('update_request_status', { p_request_id: req.id, p_status: s }));
  if (!['ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS'].includes(req.status)) return null;
  return (
    <Card className="space-y-2">
      <p className="mb-1 font-bold text-ink">حدّث حالة الشغل</p>
      {req.status === 'ACCEPTED' && (
        <>
          <Button full loading={busy} onClick={set('ON_THE_WAY')}>طالع بالطريق 🚗</Button>
          <Button full variant="outline" disabled={busy} onClick={set('IN_PROGRESS')}>وصلت وبديت الشغل</Button>
        </>
      )}
      {req.status === 'ON_THE_WAY' && <Button full loading={busy} onClick={set('IN_PROGRESS')}>وصلت وبديت الشغل 🔧</Button>}
      {req.status === 'IN_PROGRESS' && <Button full variant="accent" loading={busy} onClick={set('COMPLETED')}>خلصت الشغل ✅</Button>}
      {['ACCEPTED', 'ON_THE_WAY'].includes(req.status) && (
        <Button full variant="ghost" size="md" disabled={busy} onClick={() => {
          if (confirm('متأكد تريد تعتذر عن هذا الطلب؟ الطلب يرجع للزبون حتى يختار فني ثاني.')) set('MATCHING')();
        }}>
          أعتذر عن الطلب
        </Button>
      )}
    </Card>
  );
}

function Matching({ req, onChange }: { req: ServiceRequest; onChange: () => void }) {
  const [sending, setSending] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const matches = useLoad(async () => {
    const { data, error } = await supabase.rpc('match_providers', { p_request_id: req.id });
    if (error) throw error;
    return data as MatchRow[];
  }, [req.id, req.status]);

  async function send(providerId: string) {
    setSending(providerId);
    setErr(null);
    const { error } = await supabase.rpc('send_offer', { p_request_id: req.id, p_provider_id: providerId });
    if (error) setErr(errorMessage(error));
    await matches.reload();
    onChange();
    setSending(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-bold text-ink">الفنيين المناسبين لطلبك</p>
        <span className="text-xs text-gray-500">أول واحد يوافق ياخذ الطلب</span>
      </div>
      <ErrorBox message={err ?? matches.error} />
      {matches.loading && !matches.data ? (
        <Spinner />
      ) : matches.data?.length ? (
        <div className="space-y-3">
          {matches.data.map((m) => (
            <div key={m.provider_id} className="rounded-3xl bg-white p-4 shadow-card">
              <div className="flex gap-3">
                <Avatar name={m.display_name} url={m.avatar_url} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/providers/${m.provider_id}`} className="font-bold text-ink">{m.display_name}</Link>
                    <DemoBadge show={m.is_demo} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                    <RatingInline avg={m.rating_avg} count={m.rating_count} />
                    <span>{m.completed_jobs} شغلة</span>
                    <span>{m.years_experience} سنين خبرة</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <VerifiedBadge />
                    {m.is_available ? <Badge tone="green">متاح الآن</Badge> : <Badge>غير متاح حالياً</Badge>}
                    {m.same_area ? <Badge tone="blue">نفس منطقتك</Badge> : <Badge>{m.area}</Badge>}
                    {m.distance_km != null && <Badge>{m.distance_km.toFixed(1)} كم</Badge>}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                {m.offer_status && m.offer_status !== 'cancelled' ? (
                  <Badge tone={m.offer_status === 'offered' ? 'orange' : 'gray'} className="w-full justify-center py-2.5">
                    {OFFER_LABEL[m.offer_status]}
                  </Badge>
                ) : (
                  <Button full size="md" loading={sending === m.provider_id} disabled={!!sending} onClick={() => send(m.provider_id)}>
                    طلب فني
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="ماكو فنيين متاحين لهالخدمة حالياً"
          text="طلبك محفوظ. جرّب بعد شوية، أو غيّر الخدمة."
        />
      )}
    </div>
  );
}

function ReviewForm({ requestId, onDone }: { requestId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc('submit_review', {
      p_request_id: requestId,
      p_rating: rating,
      p_punctuality: aspects.rating_punctuality ?? null,
      p_quality: aspects.rating_quality ?? null,
      p_behavior: aspects.rating_behavior ?? null,
      p_price: aspects.rating_price ?? null,
      p_comment: comment,
    });
    setBusy(false);
    if (error) setErr(errorMessage(error));
    else {
      celebrate();
      onDone();
    }
  }

  return (
    <Card className="border-2 border-accent/30">
      <p className="font-bold text-ink">شلون كان الفني؟</p>
      <p className="mb-3 text-sm text-gray-500">تقييمك يساعد غيرك يختار صح</p>
      <StarInput value={rating} onChange={setRating} />
      <div className="mt-4 space-y-3">
        {REVIEW_ASPECTS.map((a) => (
          <div key={a.key} className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{a.label}</span>
            <StarInput size={24} value={aspects[a.key] ?? 0} onChange={(v) => setAspects({ ...aspects, [a.key]: v })} />
          </div>
        ))}
      </div>
      <Textarea className="mt-4" rows={3} placeholder="اكتب تعليقك (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      <ErrorBox message={err} />
      <Button full variant="accent" className="mt-3" disabled={!rating} loading={busy} onClick={submit}>
        أرسل التقييم
      </Button>
    </Card>
  );
}

function ComplaintBox({ req, complaints, onDone }: { req: ServiceRequest; complaints: Complaint[]; onDone: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.from('complaints').insert({
      request_id: req.id, customer_id: profile!.id, provider_id: req.provider_id, subject: subject.trim(), details: details.trim(),
    });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setOpen(false);
    setSubject('');
    setDetails('');
    onDone();
  }

  return (
    <div className="space-y-3">
      {complaints.map((c) => (
        <Card key={c.id}>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink">{c.subject}</span>
            <Badge tone={c.status === 'resolved' ? 'green' : c.status === 'rejected' ? 'gray' : 'orange'}>{COMPLAINT_LABEL[c.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-gray-600">{c.details}</p>
          {c.admin_notes && <p className="mt-2 rounded-xl bg-primary-50 p-2 text-sm text-primary">رد الإدارة: {c.admin_notes}</p>}
        </Card>
      ))}
      {open ? (
        <Card className="space-y-3">
          <p className="font-bold text-ink">قدّم شكوى</p>
          <Field label="الموضوع"><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً: تأخير، سعر، جودة الشغل" maxLength={120} /></Field>
          <Field label="التفاصيل"><Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></Field>
          <ErrorBox message={err} />
          <div className="flex gap-2">
            <Button full loading={busy} disabled={subject.trim().length < 3} onClick={submit}>إرسال الشكوى</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </div>
        </Card>
      ) : (
        <Button variant="ghost" full size="md" onClick={() => setOpen(true)}>
          <AlertTriangle className="h-4 w-4" /> عندك مشكلة ويا هذا الطلب؟ قدّم شكوى
        </Button>
      )}
    </div>
  );
}

function CancelBox({ busy, onCancel }: { busy: boolean; onCancel: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) {
    return (
      <Button variant="danger" full size="md" onClick={() => setOpen(true)}>
        إلغاء الطلب
      </Button>
    );
  }
  return (
    <Card className="space-y-3">
      <p className="font-bold text-ink">ليش تريد تلغي؟</p>
      <div className="flex flex-wrap gap-2">
        {['انحلت المشكلة', 'لگيت فني ثاني', 'الفني تأخر', 'غيرت رأيي'].map((r) => (
          <button key={r} onClick={() => setReason(r)} className={cn('rounded-full border px-3 py-1.5 text-sm', reason === r ? 'border-primary bg-primary text-white' : 'border-gray-200')}>
            {r}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="danger" full loading={busy} onClick={() => onCancel(reason || 'بدون سبب')}>تأكيد الإلغاء</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>رجوع</Button>
      </div>
    </Card>
  );
}
