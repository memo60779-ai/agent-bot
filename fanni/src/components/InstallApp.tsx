import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { LogoMark } from './Logo';
import { Button } from './ui';

// Chrome/Edge/Samsung Internet fire this; Safari never does.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const DISMISS_KEY = 'install-dismissed-at';
const dismissedRecently = () => {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < 7 * 24 * 3600 * 1000;
  } catch {
    return false;
  }
};

function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const installed = isStandalone();
  const canPrompt = !!deferred;
  const ios = isIOS();
  return {
    installed,
    available: !installed && (canPrompt || ios),
    ios,
    async install(): Promise<'prompted' | 'ios'> {
      if (deferred) {
        await deferred.prompt();
        await deferred.userChoice.catch(() => null);
        deferred = null;
        force((n) => n + 1);
        return 'prompted';
      }
      return 'ios';
    },
  };
}

// Portaled to <body>: the animated page wrapper creates a stacking context that would
// otherwise trap this sheet below the bottom navigation.
function IOSSteps({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="w-full max-w-md animate-fade-up rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <LogoMark size={48} />
          <div className="flex-1">
            <p className="font-extrabold text-ink">ثبّت «فني» على الآيفون</p>
            <p className="text-sm text-gray-500">3 خطوات، 10 ثواني</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-gray-400" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <ol className="space-y-3 text-sm font-bold text-ink">
          <li className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">١</span>
            <span className="flex-1">افتح الرابط بمتصفح <b>Safari</b></span>
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">٢</span>
            <span className="flex-1">اضغط زر المشاركة جوّة</span>
            <Share className="h-6 w-6 text-[#0A84FF]" />
          </li>
          <li className="flex items-center gap-3 rounded-2xl bg-surface p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">٣</span>
            <span className="flex-1">اختار <b>«إضافة إلى الشاشة الرئيسية»</b></span>
            <PlusSquare className="h-6 w-6 text-ink" />
          </li>
        </ol>
        <Button full className="mt-4" onClick={onClose}>تمام</Button>
      </div>
    </div>,
    document.body,
  );
}

/** Dismissible banner (home / provider dashboard). Hidden when installed or not installable. */
export function InstallBanner({ text = 'ثبّت «فني» على موبايلك وافتحه مثل أي تطبيق' }: { text?: string }) {
  const { available, install } = useInstall();
  const [hidden, setHidden] = useState(dismissedRecently());
  const [showIOS, setShowIOS] = useState(false);
  if (!available || hidden) return null;

  return (
    <>
      <div className="flex animate-fade-up items-center gap-3 rounded-3xl bg-white p-3 shadow-card ring-1 ring-accent/20">
        <LogoMark size={44} />
        <p className="flex-1 text-sm font-bold leading-snug text-ink">{text}</p>
        <Button size="sm" variant="accent" onClick={async () => { if ((await install()) === 'ios') setShowIOS(true); }}>
          <Download className="h-4 w-4" /> ثبّت
        </Button>
        <button
          aria-label="إخفاء"
          className="p-1 text-gray-300"
          onClick={() => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setHidden(true); }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {showIOS && <IOSSteps onClose={() => setShowIOS(false)} />}
    </>
  );
}

/** Always-visible button (account page). */
export function InstallButton() {
  const { available, installed, install } = useInstall();
  const [showIOS, setShowIOS] = useState(false);
  if (installed) return <p className="text-center text-sm font-bold text-emerald-600">✓ التطبيق مثبّت على هذا الموبايل</p>;
  if (!available) return null;
  return (
    <>
      <Button variant="outline" full onClick={async () => { if ((await install()) === 'ios') setShowIOS(true); }}>
        <Download className="h-5 w-5" /> ثبّت التطبيق على موبايلك
      </Button>
      {showIOS && <IOSSteps onClose={() => setShowIOS(false)} />}
    </>
  );
}
