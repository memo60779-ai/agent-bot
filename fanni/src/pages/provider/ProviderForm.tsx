import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { Service } from '../../lib/types';
import { CITIES, CITY_NAMES, PROVINCE } from '../../lib/constants';
import { errorMessage, publicUrl, uploadFile } from '../../lib/utils';
import { Avatar, Button, ErrorBox, Field, Input, Select, Textarea } from '../../components/ui';

/** Create (onboarding) or edit the provider row. */
export function ProviderForm({ onSaved, submitLabel }: { onSaved: () => void; submitLabel: string }) {
  const { profile, provider, refresh } = useAuth();
  const services = useLoad(async () =>
    must(await supabase.from('services').select('*').eq('is_active', true).order('sort_order')) as Service[],
  );

  const [displayName, setDisplayName] = useState(provider?.display_name ?? profile?.full_name ?? '');
  const [serviceId, setServiceId] = useState(provider?.service_id ?? '');
  const [city, setCity] = useState(provider?.city ?? 'كربلاء');
  const [area, setArea] = useState(provider?.area ?? CITIES['كربلاء'][0]);
  const [years, setYears] = useState(String(provider?.years_experience ?? ''));
  const [bio, setBio] = useState(provider?.bio ?? '');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!serviceId && services.data?.[0]) setServiceId(services.data[0].id); }, [services.data, serviceId]);

  const avatarPreview = avatar ? URL.createObjectURL(avatar) : provider?.avatar_url ?? null;
  const valid = displayName.trim().length >= 3 && serviceId && city && area && years !== '' && bio.trim().length >= 10;

  async function save() {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      let avatar_url = provider?.avatar_url ?? null;
      if (avatar) avatar_url = publicUrl('avatars', await uploadFile('avatars', profile.id, avatar));
      const row = {
        display_name: displayName.trim(),
        service_id: serviceId,
        province: PROVINCE,
        city,
        area,
        years_experience: Math.max(0, Math.min(60, Number(years) || 0)),
        bio: bio.trim(),
        avatar_url,
      };
      const res = provider
        ? await supabase.from('providers').update(row).eq('id', profile.id)
        : await supabase.from('providers').insert({ id: profile.id, ...row });
      if (res.error) throw res.error;
      await supabase.from('users').update({ city, area, avatar_url }).eq('id', profile.id);
      await refresh();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="mx-auto flex w-fit cursor-pointer flex-col items-center gap-2">
        <div className="relative">
          <Avatar name={displayName || '؟'} url={avatarPreview} size={96} />
          <span className="absolute -bottom-1 -end-1 rounded-full bg-accent p-2 text-white"><Camera className="h-4 w-4" /></span>
        </div>
        <span className="text-sm font-semibold text-primary">صورتك الشخصية</span>
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
      </label>
      <Field label="الاسم اللي يظهر للزبائن" hint="مثلاً: علي حسين للسباكة">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
      </Field>
      <Field label="الاختصاص">
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="المدينة">
          <Select value={city} onChange={(e) => { setCity(e.target.value); setArea(CITIES[e.target.value][0]); }}>
            {CITY_NAMES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="المنطقة">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            {CITIES[city]?.map((a) => <option key={a}>{a}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="سنين الخبرة">
        <Input type="number" inputMode="numeric" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
      </Field>
      <Field label="نبذة عنك" hint="شنو تشتغل؟ شنو يميزك؟ (10 أحرف على الأقل)">
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} />
      </Field>
      <ErrorBox message={error} />
      <Button full variant="accent" loading={busy} disabled={!valid} onClick={save}>{submitLabel}</Button>
    </div>
  );
}
