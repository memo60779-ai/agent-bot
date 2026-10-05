import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, KeyRound, LogOut, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { CITIES, CITY_NAMES } from '../lib/constants';
import { errorMessage, isPhoneAccount, publicUrl, uploadFile } from '../lib/utils';
import { Avatar, Badge, Button, Card, ErrorBox, Field, Input, PageHeader, Select } from '../components/ui';
import { InstallButton } from '../components/InstallApp';
import { PushCard } from '../components/PushCard';
import { FollowUsCard } from '../components/SocialLinks';

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

      <PushCard audience={profile?.role === 'provider' ? 'provider' : profile?.role === 'admin' ? 'admin' : 'customer'} settings />
      <InstallButton />

      <FollowUsCard />

      <ChangePassword />

      <Button variant="danger" full onClick={async () => { await signOut(); nav('/'); }}>
        <LogOut className="h-5 w-5" /> تسجيل خروج
      </Button>

      {profile.role !== 'admin' && <DeleteAccount onDeleted={() => nav('/', { replace: true })} />}

      <p className="flex justify-center gap-4 pt-2 text-xs text-gray-500">
        <Link to="/privacy" className="underline-offset-2 hover:underline">سياسة الخصوصية</Link>
        <Link to="/terms" className="underline-offset-2 hover:underline">شروط الاستخدام</Link>
      </p>
      <p className="text-center text-xs text-gray-400">فني · كربلاء</p>
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (pw.length < 6) return setError('الرمز لازم يكون 6 أحرف أو أكثر');
    if (pw !== pw2) return setError('الرمزين مو نفس الشي');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setMsg('تم تغيير الرمز ✓');
    setPw(''); setPw2(''); setOpen(false);
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" full onClick={() => { setOpen(true); setMsg(null); }}>
          <KeyRound className="h-5 w-5" /> تغيير الرمز السري
        </Button>
        {msg && <p className="mt-2 text-center text-sm font-semibold text-emerald-600">{msg}</p>}
      </div>
    );
  }
  return (
    <Card className="space-y-3">
      <p className="font-bold text-ink">تغيير الرمز السري</p>
      <Field label="الرمز الجديد">
        <Input type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label="أعد كتابة الرمز">
        <Input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </Field>
      <ErrorBox message={error} />
      <div className="flex gap-2">
        <Button full loading={busy} onClick={save}>حفظ الرمز</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
      </div>
    </Card>
  );
}

const CONFIRM_WORD = 'احذف';

/** Self-service deletion (also required by Google Play). Removes uploads first, then the account. */
function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;

  async function removeFiles() {
    for (const bucket of ['avatars', 'portfolio', 'request-photos', 'verification-docs']) {
      try {
        const { data } = await supabase.storage.from(bucket).list(profile!.id, { limit: 1000 });
        const paths = (data ?? []).map((f) => `${profile!.id}/${f.name}`);
        if (paths.length) await supabase.storage.from(bucket).remove(paths);
      } catch { /* best effort: the account is deleted either way */ }
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    // check the server rules first (e.g. a job under way) before touching files
    const { error: e } = await supabase.rpc('delete_my_account');
    if (e) {
      setBusy(false);
      return setError(errorMessage(e));
    }
    await removeFiles().catch(() => null);
    await signOut().catch(() => null);
    onDeleted();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-red-600">
        <Trash2 className="h-4 w-4" /> حذف حسابي نهائياً
      </button>
    );
  }
  return (
    <Card className="space-y-3 ring-1 ring-red-200">
      <p className="font-bold text-red-700">حذف الحساب نهائياً</p>
      <ul className="list-inside list-disc space-y-1 text-sm leading-6 text-gray-600">
        <li>يتمسح حسابك ومعلوماتك ورقمك من فني</li>
        {profile.role === 'provider'
          ? <li>يتمسح ملفك كفني، وصور شغلك، وتقييماتك، ووثيقة التوثيق</li>
          : <li>تتمسح طلباتك وتقييماتك وشكاويك</li>}
        <li>ما نگدر نرجعه بعدين</li>
      </ul>
      <Field label={`حتى تأكد، اكتب «${CONFIRM_WORD}»`}>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <ErrorBox message={error} />
      <div className="flex gap-2">
        <Button full variant="danger" loading={busy} disabled={typed.trim() !== CONFIRM_WORD} onClick={confirmDelete}>
          احذف حسابي
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setTyped(''); }}>إلغاء</Button>
      </div>
    </Card>
  );
}
