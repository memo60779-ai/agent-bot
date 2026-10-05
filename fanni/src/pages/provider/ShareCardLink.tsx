import { Link } from 'react-router-dom';
import { ChevronLeft, Lock, QrCode } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Entry to «بطاقتي». Always visible so providers find it; locked until verified. */
export function ShareCardLink({ verified }: { verified: boolean }) {
  return (
    <Link
      to="/provider/card"
      className={cn(
        'pressable flex items-center gap-3 rounded-3xl p-4 shadow-card',
        verified ? 'bg-gradient-to-l from-accent to-[#FF9A3D] text-white' : 'bg-white text-ink ring-1 ring-accent/20',
      )}
    >
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', verified ? 'bg-white/20' : 'bg-accent-50 text-accent')}>
        {verified ? <QrCode className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
      </span>
      <span className="flex-1">
        <span className="block font-extrabold">{verified ? 'بطاقتك جاهزة 🎉' : 'بطاقتك والباركود مالتك'}</span>
        <span className={cn('block text-sm', verified ? 'text-white/90' : 'text-gray-500')}>
          {verified ? 'انشرها بالواتساب وخلّي زبائنك يطلبوك من فني' : 'تجهز بعد توثيق حسابك'}
        </span>
      </span>
      <ChevronLeft className="h-5 w-5" />
    </Link>
  );
}
