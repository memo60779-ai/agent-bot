import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Loader2, Star, FlaskConical } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn, initials } from '../lib/utils';

// ---------- Button ----------
type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-600 active:bg-primary-800',
  accent: 'bg-accent text-white hover:bg-accent-600',
  outline: 'border border-gray-200 bg-white text-ink hover:bg-gray-50',
  ghost: 'text-primary hover:bg-primary-50',
  danger: 'bg-red-50 text-red-700 hover:bg-red-100',
};

export function Button({
  variant = 'primary', loading, full, size = 'lg', className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; loading?: boolean; full?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none',
        size === 'lg' && 'min-h-[52px] px-5 text-base',
        size === 'md' && 'min-h-[44px] px-4 text-sm',
        size === 'sm' && 'min-h-[36px] px-3 text-sm rounded-xl',
        VARIANTS[variant],
        full && 'w-full',
        className,
      )}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', full, className, children }: {
  to: string; variant?: Variant; full?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition',
        VARIANTS[variant], full && 'w-full', className,
      )}
    >
      {children}
    </Link>
  );
}

// ---------- Card ----------
export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn('rounded-3xl bg-white p-4 shadow-card', onClick && 'cursor-pointer', className)}>
      {children}
    </div>
  );
}

// ---------- Badges ----------
const TONES = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-primary-50 text-primary',
  orange: 'bg-accent-50 text-accent-600',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-700',
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <Badge tone="blue">
      <BadgeCheck className="h-3.5 w-3.5" /> موثق
    </Badge>
  );
}

export function AvailableBadge({ available }: { available: boolean }) {
  return available ? (
    <Badge tone="green">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> متاح الآن
    </Badge>
  ) : (
    <Badge tone="gray">غير متاح حالياً</Badge>
  );
}

/** Demo rows are always labelled so they are never mistaken for real providers. */
export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Badge tone="orange" className="!px-2 !py-0.5 text-[10px]">
      <FlaskConical className="h-3 w-3" /> تجريبي
    </Badge>
  );
}

// ---------- Rating ----------
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center" aria-label={`${value} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i <= Math.round(value) ? 'fill-accent text-accent' : 'fill-gray-200 text-gray-200'}
        />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange, size = 36 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          type="button"
          key={i}
          onClick={() => onChange(i)}
          className="p-0.5"
          aria-label={`${i} نجوم`}
        >
          <Star
            style={{ width: size, height: size }}
            className={i <= value ? 'fill-accent text-accent' : 'fill-gray-100 text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}

export function RatingInline({ avg, count }: { avg: number; count: number }) {
  if (!count) return <span className="text-xs text-gray-500">جديد</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-ink">
      <Star className="h-4 w-4 fill-accent text-accent" />
      {Number(avg).toFixed(1)}
      <span className="font-normal text-gray-500">({count})</span>
    </span>
  );
}

// ---------- Avatar ----------
export function Avatar({ name, url, size = 48 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="flex shrink-0 items-center justify-center rounded-2xl bg-primary-50 font-bold text-primary"
    >
      {initials(name)}
    </div>
  );
}

// ---------- Feedback ----------
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center py-10', className)}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (!message) return null;
  return (
    <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
      {message}
      {onRetry && (
        <button onClick={onRetry} className="ms-2 font-semibold underline">
          جرّب مرة ثانية
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: {
  icon?: ReactNode; title: string; text?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
      {icon && <div className="mb-3 text-gray-300">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {text && <p className="mt-1 text-sm text-gray-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------- Page header ----------
export function PageHeader({ title, back, action }: { title: string; back?: boolean | string; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center gap-2 bg-surface/90 px-4 py-3 backdrop-blur">
      {back && (
        <button
          onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-card"
          aria-label="رجوع"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      )}
      <h1 className="flex-1 text-lg font-bold text-ink">{title}</h1>
      {action}
    </div>
  );
}

// ---------- Form fields ----------
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-base text-ink placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cn(inputCls, 'resize-none', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, 'appearance-none bg-white', props.className)} />;
}

export function ChoiceChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-[48px] rounded-2xl border px-4 py-3 text-start text-sm font-semibold transition',
        selected ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-ink hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-card">
      {icon && <div className="mb-1 flex justify-center text-accent">{icon}</div>}
      <div className="text-lg font-bold text-ink">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
