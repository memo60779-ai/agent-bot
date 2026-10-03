import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Check, Crosshair, ImagePlus, Lock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { Provider, Service, TimeSlot } from '../../lib/types';
import { CITIES, CITY_NAMES, PROVINCE, TIME_SLOT_LABEL, UPCOMING_PROVINCES } from '../../lib/constants';
import { errorMessage, uploadFile, cn } from '../../lib/utils';
import { ServiceIcon } from '../../components/ServiceIcon';
import {
  Avatar, Button, ChoiceChip, ErrorBox, Field, Input, PageHeader, Select, Spinner, Textarea,
} from '../../components/ui';

const STEPS = ['الخدمة', 'المشكلة', 'الوصف', 'الموقع', 'الوقت', 'تأكيد'];

export default function NewRequest() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { profile } = useAuth();
  const targetProviderId = params.get('provider');

  const services = useLoad(async () =>
    must(await supabase.from('services').select('*').eq('is_active', true).order('sort_order')) as Service[],
  );
  const target = useLoad(async () => {
    if (!targetProviderId) return null;
    return must(await supabase.from('providers').select('*').eq('id', targetProviderId).maybeSingle()) as Provider | null;
  }, [targetProviderId]);

  const [step, setStep] = useState(params.get('service') ? 1 : 0);
  const [serviceSlug, setServiceSlug] = useState(params.get('service') ?? '');
  const [problem, setProblem] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [city, setCity] = useState(profile?.city && CITIES[profile.city] ? profile.city : 'كربلاء');
  const [area, setArea] = useState(profile?.area ?? '');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [slot, setSlot] = useState<TimeSlot>('today');
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => services.data?.find((s) => s.slug === serviceSlug), [services.data, serviceSlug]);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);
  useEffect(() => { if (!CITIES[city]?.includes(area)) setArea(CITIES[city]?.[0] ?? ''); }, [city]); // eslint-disable-line

  if (profile?.role === 'provider') {
    return (
      <div className="pt-6">
        <PageHeader title="طلب خدمة" back />
        <ErrorBox message="حسابك حساب فني. حتى تطلب خدمة سوّي حساب زبون منفصل." />
      </div>
    );
  }
  if (services.loading) return <Spinner className="pt-32" />;

  const canNext = [
    !!service,
    !!problem,
    description.trim().length >= 5,
    !!city && !!area,
    slot !== 'scheduled' || !!scheduledAt,
    true,
  ][step];

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  async function submit() {
    if (!profile || !service) return;
    setSubmitting(true);
    setError(null);
    try {
      let photo_path: string | null = null;
      if (photo) photo_path = await uploadFile('request-photos', profile.id, photo);

      const req = must(
        await supabase
          .from('service_requests')
          .insert({
            customer_id: profile.id,
            service_id: service.id,
            problem_type: problem,
            description: description.trim(),
            photo_path,
            province: PROVINCE,
            city,
            area,
            address_details: address.trim() || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            time_slot: slot,
            scheduled_at: slot === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
          })
          .select('id')
          .single(),
      ) as { id: string };

      // Coming from a provider profile: send it straight to that provider.
      if (target.data && target.data.service_id === service.id) {
        const { error: offerErr } = await supabase.rpc('send_offer', {
          p_request_id: req.id, p_provider_id: target.data.id,
        });
        if (offerErr) console.warn(offerErr);
      } else {
        await supabase.rpc('match_providers', { p_request_id: req.id }); // moves NEW -> MATCHING
      }
      nav(`/requests/${req.id}?sent=1`, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="طلب خدمة جديد" back />

      {/* progress: animated fill + current step name */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span key={step} className="animate-fade-up text-sm font-extrabold text-ink">{STEPS[step]}</span>
          <span className="text-xs font-bold text-accent">{step + 1} / {STEPS.length}</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-gray-200">
          <div
            className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-accent to-[#FFA24D] transition-[width] duration-500 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-2 w-2 rounded-full transition-all duration-300',
              i < step ? 'bg-accent' : i === step ? 'scale-150 bg-accent' : 'bg-gray-300')} />
          ))}
        </div>
      </div>

      {target.data && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-primary-50 p-3">
          <Avatar name={target.data.display_name} url={target.data.avatar_url} size={40} />
          <p className="text-sm text-primary">
            الطلب راح يوصل مباشرة لـ <b>{target.data.display_name}</b>
          </p>
        </div>
      )}

      <div key={step} className="animate-page-in pb-28">
      {step === 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold text-ink">شنو تحتاج؟</h2>
          <div className="grid grid-cols-2 gap-3">
            {services.data?.map((s) => (
              <button
                key={s.id}
                onClick={() => { setServiceSlug(s.slug); setProblem(''); setStep(1); }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border bg-white p-4 text-start transition',
                  s.slug === serviceSlug ? 'border-primary ring-2 ring-primary/15' : 'border-gray-100',
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-50 text-accent">
                  <ServiceIcon name={s.icon} className="h-5 w-5" />
                </span>
                <span className="font-semibold text-ink">{s.name_ar}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 1 && service && (
        <section>
          <h2 className="mb-1 text-xl font-bold text-ink">شنو نوع المشكلة؟</h2>
          <p className="mb-4 text-sm text-gray-500">{service.name_ar}</p>
          <div className="grid grid-cols-1 gap-2.5">
            {service.problem_types.map((p) => (
              <ChoiceChip key={p} selected={problem === p} onClick={() => { setProblem(p); setStep(2); }}>
                {p}
              </ChoiceChip>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-ink">اوصف المشكلة</h2>
          <Field label="الوصف" hint="كلما توضح أكثر، الفني يجي مجهز أكثر">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثلاً: المي دا تنزل من جوة المغسلة من البارحة…"
              maxLength={1000}
            />
          </Field>
          <Field label="صورة للمشكلة (اختياري)">
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="" className="h-48 w-full rounded-2xl object-cover" />
                <button
                  onClick={() => setPhoto(null)}
                  className="absolute end-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
                  aria-label="حذف الصورة"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-white text-gray-500">
                <span className="flex gap-3">
                  <Camera className="h-6 w-6" /> <ImagePlus className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold">صوّر أو اختار صورة</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
            <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <Lock className="h-3 w-3" /> الصورة تظهر بس للفني اللي تدزله الطلب
            </span>
          </Field>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-ink">وين المكان؟</h2>
          <Field label="المحافظة">
            <Select value={PROVINCE} disabled>
              <option>{PROVINCE}</option>
              {UPCOMING_PROVINCES.map((p) => <option key={p} disabled>{p} (قريباً)</option>)}
            </Select>
          </Field>
          <Field label="المدينة / القضاء">
            <Select value={city} onChange={(e) => setCity(e.target.value)}>
              {CITY_NAMES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="المنطقة">
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              {CITIES[city]?.map((a) => <option key={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="أقرب نقطة دالة (اختياري)" hint="مثلاً: قرب جامع… / مقابل مدرسة…">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
          </Field>
          <Button variant="outline" size="md" full onClick={locate} loading={locating} type="button">
            {coords ? <><Check className="h-4 w-4 text-emerald-600" /> تم تحديد موقعك</> : <><Crosshair className="h-4 w-4" /> استخدم موقعي الحالي (اختياري)</>}
          </Button>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-ink">شوكت تحتاجه؟</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {(Object.keys(TIME_SLOT_LABEL) as TimeSlot[]).map((s) => (
              <ChoiceChip key={s} selected={slot === s} onClick={() => setSlot(s)}>
                {TIME_SLOT_LABEL[s]}
              </ChoiceChip>
            ))}
          </div>
          {slot === 'scheduled' && (
            <Field label="اختار اليوم والساعة">
              <Input
                type="datetime-local"
                value={scheduledAt}
                min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </Field>
          )}
        </section>
      )}

      {step === 5 && service && (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-ink">راجع طلبك</h2>
          <div className="divide-y divide-gray-100 rounded-3xl bg-white px-4 shadow-card">
            {[
              ['الخدمة', service.name_ar],
              ['المشكلة', problem],
              ['الوصف', description],
              ['المكان', `${area}، ${city}${address ? ` — ${address}` : ''}`],
              ['الوقت', slot === 'scheduled' ? new Date(scheduledAt).toLocaleString('ar-IQ') : TIME_SLOT_LABEL[slot]],
              ['صورة', photo ? 'مرفقة' : 'بدون'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 py-3 text-sm">
                <span className="w-16 shrink-0 text-gray-500">{k}</span>
                <span className="font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <p className="rounded-2xl bg-accent-50 p-3 text-sm text-accent-600">
            الدفع مباشرة بينك وبين الفني بعد ما يخلص الشغل. فني ما تاخذ منك أي مبلغ.
          </p>
          <ErrorBox message={error} />
        </section>
      )}

      </div>

      {/* footer actions */}
      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-xl gap-2 bg-gradient-to-t from-surface via-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="w-28" disabled={submitting}>
            رجوع
          </Button>
        )}
        {step < 5 ? (
          <Button full onClick={() => setStep(step + 1)} disabled={!canNext}>
            التالي
          </Button>
        ) : (
          <Button full variant="accent" onClick={submit} loading={submitting}>
            أرسل الطلب
          </Button>
        )}
      </div>
    </div>
  );
}
