import { useEffect, useState } from 'react';
import { Car, Clock } from 'lucide-react';
import { cn } from '../lib/utils';

function useNow(ms = 10_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

const clock = (d: Date) => d.toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' });

/** Live countdown while the provider is on the way. */
export function EtaCard({ etaAt, startedAt, forProvider }: { etaAt: string; startedAt: string | null; forProvider?: boolean }) {
  const now = useNow();
  const eta = new Date(etaAt).getTime();
  const start = startedAt ? new Date(startedAt).getTime() : eta - 20 * 60_000;
  const left = Math.ceil((eta - now) / 60_000);
  const late = left < 0;
  const progress = Math.min(1, Math.max(0.04, (now - start) / Math.max(1, eta - start)));

  return (
    <div className={cn('animate-fade-up overflow-hidden rounded-3xl p-5 shadow-card', late ? 'bg-amber-50 text-amber-900' : 'bg-primary text-white')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={cn('text-sm font-bold', late ? 'text-amber-700' : 'text-white/70')}>
            {forProvider ? 'وعدت الزبون توصل' : late ? 'المفروض وصل هسه' : 'الفني بالطريق، يوصل خلال'}
          </p>
          {late ? (
            <p className="mt-1 text-2xl font-extrabold">متأخر {Math.abs(left)} دقيقة</p>
          ) : (
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tabular-nums">{Math.max(1, left)}</span>
              <span className="text-lg font-bold">دقيقة</span>
            </p>
          )}
        </div>
        <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', late ? 'bg-amber-100' : 'bg-white/10')}>
          {late ? <Clock className="h-7 w-7" /> : <Car className="h-7 w-7" />}
        </span>
      </div>

      {!late && (
        <div className="relative mt-4 h-2 rounded-full bg-white/15">
          <div className="absolute inset-y-0 right-0 rounded-full bg-accent transition-all duration-1000" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <p className={cn('mt-3 text-sm', late ? 'text-amber-800' : 'text-white/80')}>
        {late
          ? forProvider ? 'إذا راح تتأخر بعد، حدّث الوقت حتى الزبون يعرف.' : 'تگدر تتصل بيه من الأزرار تحت.'
          : `الوصول حوالي ${clock(new Date(eta))}`}
      </p>
    </div>
  );
}
