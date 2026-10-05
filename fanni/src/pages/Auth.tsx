import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Home, MessageCircle, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cn, errorMessage, loginEmail, normalizePhone } from '../lib/utils';
import { Button, ErrorBox, Field, Input, Textarea } from '../components/ui';
import { Logo } from '../components/Logo';

function homeFor(role?: string) {
  return role === 'provider' ? '/provider' : role === 'admin' ? '/admin' : '/';
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-10">
      <div className="-mx-5 mb-6 rounded-b-[2rem] bg-primary px-6 pb-8 pt-10 text-white">
        <Link to="/" className="inline-block animate-pop"><Logo size={44} light /></Link>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
      <div className="animate-fade-up">{children}</div>
    </div>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { profile, session } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && profile) nav(params.get('next') || homeFor(profile.role), { replace: true });
  }, [session, profile]); // eslint-disable-line

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(identifier), password });
    if (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="هلا بيك من جديد" subtitle="سجّل دخولك حتى تكمل">
      <form onSubmit={submit} className="space-y-4">
        <Field label="رقم الموبايل" hint="أو الإيميل إذا سجلت بيه">
          <Input dir="ltr" inputMode="tel" autoComplete="username" placeholder="07XXXXXXXXX" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </Field>
        <Field label="الرمز السري">
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="-mt-2 text-start">
          <Link to="/forgot" className="text-sm font-semibold text-primary">نسيت الرمز؟</Link>
        </div>
        <ErrorBox message={error} />
        <Button full loading={busy} type="submit">دخول</Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        ما عندك حساب؟{' '}
        <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-semibold text-primary">
          سجّل هسه
        </Link>
      </p>
    </AuthFrame>
  );
}

export function Register() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { profile, session } = useAuth();
  const [role, setRole] = useState<'customer' | 'provider'>(params.get('role') === 'provider' ? 'provider' : 'customer');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session && profile) {
      nav(profile.role === 'provider' ? '/provider/onboarding' : params.get('next') || '/', { replace: true });
    }
  }, [session, profile]); // eslint-disable-line

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setError('رقم الموبايل لازم يبدي بـ07 ويكون 11 رقم');
    setBusy(true);
    setError(null);
    // Phone account: created by a DB function (no email / SMS needed), then a normal login.
    const { data: email, error } = await supabase.rpc('phone_signup', {
      p_phone: normalized, p_password: password, p_full_name: fullName.trim(), p_role: role,
    });
    if (error) {
      setBusy(false);
      return setError(errorMessage(error));
    }
    const { error: loginError } = await supabase.auth.signInWithPassword({ email: email as string, password });
    setBusy(false);
    if (loginError) setError(errorMessage(loginError));
  }

  return (
    <AuthFrame title="حساب جديد" subtitle="ثواني وتكمل">
      <div className="mb-5 grid grid-cols-2 gap-3">
        {([
          ['customer', 'أحتاج خدمة', <Home key="h" className="h-6 w-6" />],
          ['provider', 'أنا فني', <Wrench key="w" className="h-6 w-6" />],
        ] as const).map(([r, label, icon]) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              'flex flex-col items-center gap-2 rounded-2xl border-2 p-4 font-semibold transition',
              role === r ? 'border-accent bg-accent-50 text-accent-600' : 'border-gray-100 bg-white text-gray-500',
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <Field label={role === 'provider' ? 'الاسم الكامل' : 'الاسم'}>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="رقم الموبايل" hint="تسجل دخول بيه. يظهر للطرف الثاني بس بعد قبول الطلب">
          <Input required dir="ltr" inputMode="tel" autoComplete="username" placeholder="07XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="الرمز السري" hint="6 أحرف أو أرقام أو أكثر — احفظه زين">
          <Input required type="password" dir="ltr" minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <Button full variant={role === 'provider' ? 'accent' : 'primary'} loading={busy} type="submit">
          {role === 'provider' ? 'سجّل كفني' : 'إنشاء حساب'}
        </Button>
        <p className="text-center text-xs leading-6 text-gray-500">
          بتسجيلك توافق على <Link to="/terms" className="text-primary">شروط الاستخدام</Link> و
          <Link to="/privacy" className="text-primary">سياسة الخصوصية</Link>
        </p>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        عندك حساب؟ <Link to="/login" className="font-semibold text-primary">سجّل دخول</Link>
      </p>
    </AuthFrame>
  );
}

/**
 * No SMS: the request goes to the admins, who confirm on WhatsApp (same
 * number) and set a new password. The answer never says whether the number
 * has an account.
 */
export function ForgotPassword() {
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('request_password_reset', { p_phone: phone, p_note: note || null });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthFrame title="وصل طلبك ✅" subtitle="نرجعلك بأقرب وقت">
        <div className="space-y-4 rounded-3xl bg-white p-5 shadow-card">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="leading-7 text-ink">
            إذا الرقم <b dir="ltr">{normalizePhone(phone) ?? phone}</b> مسجّل عدنا، راح نتواصل وياك
            <b> على واتساب بنفس الرقم</b> حتى نتأكد إنه إنت، ونرسلك رمز جديد.
          </p>
          <p className="flex items-center gap-2 rounded-2xl bg-surface p-3 text-sm text-gray-600">
            <MessageCircle className="h-5 w-5 shrink-0 text-emerald-600" />
            فريق فني ما يطلب منك الرمز القديم أبد. لا تعطي رمزك لأي أحد.
          </p>
          <Link to="/login" className="block text-center font-semibold text-primary">رجوع لتسجيل الدخول</Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="نسيت الرمز؟" subtitle="ما يهم، نرجّع حسابك">
      <form onSubmit={submit} className="space-y-4">
        <Field label="رقم الموبايل المسجّل بيه">
          <Input dir="ltr" inputMode="tel" autoComplete="username" placeholder="07XXXXXXXXX" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="ملاحظة (اختياري)" hint="مثلاً: اسمك بالحساب، أو شوكت يناسبك نتواصل">
          <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <Button full loading={busy} type="submit">أرسل الطلب</Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        تذكرته؟ <Link to="/login" className="font-semibold text-primary">سجّل دخول</Link>
      </p>
    </AuthFrame>
  );
}
