import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Copy, Download, Link2, MessageCircle, Share2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { renderStoryCard } from '../../lib/shareCard';
import { Button, Card, ErrorBox, PageHeader, Spinner } from '../../components/ui';

export const providerLink = (code: number) => `${window.location.origin}/p/${code}`;

export function shareMessage(name: string, link: string) {
  return `هلا 👋 هسه تگدر تطلبني عن طريق تطبيق «فني» 🔧\n`
    + `تشوف تقييماتي وصور شغلي، وتطلب بدقيقة وحدة:\n${link}\n\n`
    + `— ${name}`;
}

export default function ShareCard() {
  const { provider } = useAuth();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = provider ? providerLink(provider.public_code) : '';
  const verified = provider?.verification_status === 'verified';

  useEffect(() => {
    if (!provider || !verified) return;
    let alive = true;
    renderStoryCard({
      name: provider.display_name,
      service: provider.services?.name_ar ?? '',
      area: provider.area,
      avatarUrl: provider.avatar_url,
      ratingAvg: Number(provider.rating_avg),
      ratingCount: provider.rating_count,
      years: provider.years_experience,
      jobs: provider.completed_jobs,
      link,
    })
      .then((b) => alive && setBlob(b))
      .catch(() => alive && setError('ما گدرنا نسوي الصورة، جرّب مرة ثانية.'));
    return () => { alive = false; };
  }, [provider?.id, provider?.avatar_url, provider?.rating_count, verified]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!provider) return <Navigate to="/provider/onboarding" replace />;

  if (!verified) {
    return (
      <div className="space-y-4">
        <PageHeader title="بطاقتي" back="/provider" />
        <Card className="text-center">
          <ShieldAlert className="mx-auto mb-2 h-10 w-10 text-accent" />
          <p className="font-bold text-ink">بطاقتك تجهز بعد توثيق حسابك</p>
          <p className="mt-1 text-sm text-gray-500">من توثّقك الإدارة، يصيرلك رابط خاص وصورة ستوري تنشرها لزبائنك.</p>
        </Card>
      </div>
    );
  }

  const fileName = `fanni-${provider.public_code}.png`;
  const message = shareMessage(provider.display_name, link);

  async function shareImage() {
    if (!blob) return;
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: message });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    download();
  }

  function download() {
    if (!preview) return;
    const a = document.createElement('a');
    a.href = preview;
    a.download = fileName;
    a.click();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="بطاقتي" back="/provider" />

      <div className="rounded-3xl bg-primary p-4 text-white">
        <p className="font-extrabold">انشرها بحالة الواتساب 📲</p>
        <p className="mt-1 text-sm leading-6 text-white/80">
          زبائنك يطلبوك من الرابط، والطلب يوصلك إنت مباشرة. وكل شغلة تخلصها تاخذ عليها تقييم يرفع اسمك.
        </p>
      </div>

      <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-3xl bg-gray-100 shadow-card" style={{ aspectRatio: '9 / 16' }}>
        {preview ? <img src={preview} alt="بطاقة الفني" className="h-full w-full object-cover" /> : <Spinner className="pt-40" />}
      </div>
      <ErrorBox message={error} />

      <div className="space-y-2">
        <Button full variant="accent" onClick={shareImage} disabled={!blob}>
          <Share2 className="h-5 w-5" /> شارك الصورة (ستوري / حالة)
        </Button>
        <Button full variant="outline" onClick={download} disabled={!preview}>
          <Download className="h-5 w-5" /> حفظ الصورة
        </Button>
      </div>

      <Card className="space-y-3">
        <p className="flex items-center gap-2 font-bold text-ink"><Link2 className="h-5 w-5 text-accent" /> رابطك الخاص</p>
        <div className="flex items-center gap-2 rounded-2xl bg-surface p-3">
          <span className="flex-1 truncate text-sm font-semibold text-ink" dir="ltr">{link.replace(/^https?:\/\//, '')}</span>
          <button onClick={copyLink} className="pressable flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-primary shadow-card">
            <Copy className="h-4 w-4" /> {copied ? 'تم النسخ ✓' : 'نسخ'}
          </button>
        </div>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="pressable flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 font-bold text-white"
        >
          <MessageCircle className="h-5 w-5" /> دز الرابط لزبائنك بالواتساب
        </a>
        <p className="whitespace-pre-line rounded-2xl bg-surface p-3 text-xs leading-6 text-gray-600">{message}</p>
      </Card>
    </div>
  );
}
