import { useState } from 'react';
import { BellRing, CheckCircle2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import { errorMessage } from '../../lib/utils';
import { Button, Card, ErrorBox } from '../../components/ui';

const BOT = import.meta.env.VITE_TELEGRAM_BOT as string | undefined;

/** Links the signed-in user's Telegram (providers: new requests; admins: verification queue). */
export function TelegramCard({
  title = 'لا تفوّت أي طلب',
  text = 'فعّل الإشعارات وتجيك رسالة على تليكرام أول ما يوصلك طلب.',
  linkedText = 'أي طلب جديد يوصلك رسالة فوراً',
}: { title?: string; text?: string; linkedText?: string } = {}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = useLoad(async () => {
    const { data, error } = await supabase.rpc('telegram_status');
    if (error) throw error;
    return data as boolean;
  });

  if (!BOT || status.loading) return null;

  async function link() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('telegram_link_start');
    if (error) {
      setError(errorMessage(error));
      setBusy(false);
      return;
    }
    // same-tab navigation: window.open after an await is popup-blocked on phones
    window.location.href = `https://t.me/${BOT}?start=${data}`;
  }

  async function unlink() {
    if (!confirm('توقف إشعارات تليكرام؟')) return;
    await supabase.rpc('telegram_unlink');
    status.reload();
  }

  if (status.data) {
    return (
      <Card className="flex items-center gap-3">
        <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
        <div className="flex-1">
          <p className="font-bold text-ink">إشعارات تليكرام مفعّلة</p>
          <p className="text-sm text-gray-500">{linkedText}</p>
        </div>
        <button onClick={unlink} className="text-sm font-semibold text-gray-400">إيقاف</button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 border-2 border-[#229ED9]/30">
      <div className="flex items-center gap-3">
        <BellRing className="h-7 w-7 shrink-0 text-[#229ED9]" />
        <div>
          <p className="font-bold text-ink">{title}</p>
          <p className="text-sm text-gray-500">{text}</p>
        </div>
      </div>
      <ErrorBox message={error} />
      <Button full loading={busy} onClick={link} className="!bg-[#229ED9] hover:!bg-[#1c8cc2]">
        <Send className="h-5 w-5" /> فعّل إشعارات تليكرام
      </Button>
      <p className="text-center text-xs text-gray-400">بعد ما يفتح تليكرام اضغط "Start" وارجع للتطبيق</p>
    </Card>
  );
}
