import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Home, Wrench } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { cn, errorMessage } from '../lib/utils';
import { Button, ErrorBox, Field, Input } from '../components/ui';

function homeFor(role?: string) {
  return role === 'provider' ? '/provider' : role === 'admin' ? '/admin' : '/';
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-5 pb-10">
      <div className="-mx-5 mb-6 rounded-b-[2rem] bg-primary px-6 pb-8 pt-10 text-white">
        <Link to="/" className="text-3xl font-extrabold">فني<span className="text-accent">.</span></Link>
        <h1 className="mt-6 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

export function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { profile, session } = useAuth();
  const [email, setEmail] = useState('');
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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="هلا بيك من جديد" subtitle="سجّل دخولك حتى تكمل">
      <form onSubmit={submit} className="space-y-4">
        <Field label="الإيميل">
          <Input type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="الرمز السري">
          <Input type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (session && profile) {
      nav(profile.role === 'provider' ? '/provider/onboarding' : params.get('next') || '/', { replace: true });
    }
  }, [session, profile]); // eslint-disable-line

  const phoneOk = /^07\d{9}$/.test(phone.replace(/\s/g, ''));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phoneOk) return setError('رقم الموبايل لازم يبدي بـ07 ويكون 11 رقم');
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.replace(/\s/g, ''), role } },
    });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    if (!data.session) setCheckEmail(true); // email confirmation is enabled on the project
  }

  if (checkEmail) {
    return (
      <AuthFrame title="تأكد من إيميلك" subtitle="دزينالك رابط تفعيل">
        <p className="text-center text-gray-600">افتح الإيميل ({email}) واضغط على رابط التفعيل، بعدها سجّل دخول.</p>
        <Link to="/login" className="mt-6 block text-center font-semibold text-primary">تسجيل الدخول</Link>
      </AuthFrame>
    );
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
        <Field label="رقم الموبايل" hint="يظهر للطرف الثاني بس بعد قبول الطلب">
          <Input required dir="ltr" inputMode="tel" placeholder="07XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="الإيميل">
          <Input required type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="الرمز السري" hint="6 أحرف أو أكثر">
          <Input required type="password" dir="ltr" minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox message={error} />
        <Button full variant={role === 'provider' ? 'accent' : 'primary'} loading={busy} type="submit">
          {role === 'provider' ? 'سجّل كفني' : 'إنشاء حساب'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        عندك حساب؟ <Link to="/login" className="font-semibold text-primary">سجّل دخول</Link>
      </p>
    </AuthFrame>
  );
}
