import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { CITIES, CITY_NAMES } from '../lib/constants';
import { errorMessage, isPhoneAccount, publicUrl, uploadFile } from '../lib/utils';
import { Avatar, Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select } from '../components/ui';

const ROLE_LABEL = { customer: 'زبون', provider: 'فني', admin: 'مدير' } as const;

export default function Account() {
  const { profile, refresh, signOut } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [city, setCity] = useState(profile?.city ?? 'كربلاء');
  const [area, setArea] = useState(profile?.area ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!profile) return null;

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = publicUrl('avatars', await uploadFile('avatars', profile!.id, file));
      const { error } = await supabase.from('users').update({ avatar_url: url }).eq('id', profile!.id);
      if (error) throw error;
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    setError(null);
    const { error } = await supabase
      .from('users')
      .update({ full_name: name.trim(), phone: phone.trim(), city, area: area || null })
      .eq('id', profile!.id);
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setMsg('تم الحفظ');
    refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader title="حسابي" />
      <Card className="flex items-center gap-3">
        <label className="relative cursor-pointer" aria-label="تغيير الصورة">
          <Avatar name={profile.full_name || '؟'} url={profile.avatar_url} size={56} />
          <span className="absolute -bottom-1 -end-1 rounded-full bg-accent p-1.5 text-white">
            <Camera className={uploading ? 'h-3 w-3 animate-pulse' : 'h-3 w-3'} />
          </span>
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={(e) => changeAvatar(e.target.files?.[0])} />
        </label>
        <div className="flex-1">
          <p className="font-bold text-ink">{profile.full_name}</p>
          <p className="text-sm text-gray-500" dir="ltr">{isPhoneAccount(profile.email) ? profile.phone : profile.email}</p>
        </div>
        <Badge tone="blue">{ROLE_LABEL[profile.role]}</Badge>
      </Card>

      <Card className="space-y-4">
        <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="رقم الموبايل" hint={isPhoneAccount(profile.email) ? 'هذا رقم الدخول مالتك. لتغييره تواصل ويا الإدارة' : undefined}>
          <Input dir="ltr" inputMode="tel" value={phone} disabled={isPhoneAccount(profile.email)} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="المدينة">
          <Select value={city} onChange={(e) => { setCity(e.target.value); setArea(''); }}>
            {CITY_NAMES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="المنطقة" hint="نستخدمها حتى نطلعلك الفنيين الأقرب">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">— اختار —</option>
            {CITIES[city]?.map((a) => <option key={a}>{a}</option>)}
          </Select>
        </Field>
        <ErrorBox message={error} />
        {msg && <p className="text-sm font-semibold text-emerald-600">{msg}</p>}
        <Button full loading={busy} onClick={save}>حفظ</Button>
      </Card>

      <Button variant="danger" full onClick={async () => { await signOut(); nav('/'); }}>
        <LogOut className="h-5 w-5" /> تسجيل خروج
      </Button>
      <p className="pt-2 text-center text-xs text-gray-400">فني — نسخة تجريبية مجانية · كربلاء</p>
    </div>
  );
}
