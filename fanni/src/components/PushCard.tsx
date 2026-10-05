import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Check } from 'lucide-react';
import { enablePush, getPushState, type PushState } from '../lib/push';
import { InstallButton } from './InstallApp';
import { Button } from './ui';
import { cn } from '../lib/utils';

const COPY = {
  provider: { title: 'خلّي الطلبات توصلك كإشعار 🔔', text: 'مثل الواتساب، توصلك حتى لو التطبيق مسدود.' },
  customer: { title: 'نبلغك لما الفني يقبل 🔔', text: 'إشعار على موبايلك لما يقبل طلبك، ولما يطلع بالطريق.' },
  admin: { title: 'إشعارات الإدارة 🔔', text: 'إشعار للطلبات اللي تنتظر فني، ولطلبات التوثيق واستعادة الرمز.' },
} as const;

/**
 * Turn on phone notifications for this device.
 * `settings` = always visible (account page); otherwise hidden once enabled
 * or when the browser can't do push at all.
 */
export function PushCard({ audience, settings }: { audience: keyof typeof COPY; settings?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [justEnabled, setJustEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    getPushState().then((s) => alive && setState(s)).catch(() => alive && setState('unsupported'));
    return () => { alive = false; };
  }, []);

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      const s = await enablePush();
      setState(s);
      if (s === 'on') setJustEnabled(true);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  }

  if (!state) return null;
  if (!settings && !justEnabled && (state === 'on' || state === 'unsupported')) return null;

  const copy = COPY[audience];

  if (state === 'on') {
    return (
      <div className="flex animate-fade-up items-center gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-800">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white">
          <Check className="h-5 w-5" />
        </span>
        <p className="flex-1 text-sm font-bold">الإشعارات شغّالة على هذا الموبايل ✓</p>
      </div>
    );
  }

  return (
    <div className={cn('animate-fade-up space-y-3 rounded-3xl bg-white p-4 shadow-card', !settings && 'ring-1 ring-accent/25')}>
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
          state === 'denied' ? 'bg-red-50 text-red-600' : 'bg-accent-50 text-accent',
        )}>
          {state === 'denied' ? <BellOff className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
        </span>
        <div className="flex-1">
          <p className="font-extrabold text-ink">{copy.title}</p>
          <p className="text-sm leading-6 text-gray-500">
            {state === 'needs-install' && 'على الآيفون الإشعارات تشتغل بس بعد ما تثبّت التطبيق على الشاشة الرئيسية.'}
            {state === 'denied' && 'الإشعارات مسدودة. افتح إعدادات المتصفح ← إعدادات الموقع ← الإشعارات، واسمح لـ«فني».'}
            {state === 'unsupported' && 'هذا المتصفح ما يدعم الإشعارات. افتح التطبيق بـ Chrome أو ثبّته على الشاشة الرئيسية.'}
            {state === 'off' && copy.text}
          </p>
        </div>
      </div>
      {state === 'off' && (
        <Button full variant="accent" size="md" onClick={enable} loading={busy}>
          <Bell className="h-4 w-4" /> فعّل الإشعارات
        </Button>
      )}
      {state === 'needs-install' && <InstallButton />}
      {failed && <p className="text-center text-xs font-bold text-red-600">ما گدرنا نفعّلها هسه، جرّب بعد شوية.</p>}
    </div>
  );
}
