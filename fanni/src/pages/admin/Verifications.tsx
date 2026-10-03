import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { must, useLoad } from '../../lib/useLoad';
import type { VerificationRequest, VerificationStatus } from '../../lib/types';
import { VERIFICATION_LABEL } from '../../lib/constants';
import { cn, errorMessage, signedUrl, timeAgo } from '../../lib/utils';
import { Badge, Button, Card, DemoBadge, EmptyState, ErrorBox, Spinner, Textarea } from '../../components/ui';

const FILTERS: (VerificationStatus | 'all')[] = ['pending', 'needs_info', 'verified', 'rejected', 'all'];

export default function Verifications() {
  const [filter, setFilter] = useState<VerificationStatus | 'all'>('pending');
  const list = useLoad(async () => {
    let q = supabase
      .from('verification_requests')
      .select('*, providers(id, display_name, city, area, years_experience, is_demo, services(name_ar))')
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    return must(await q) as VerificationRequest[];
  }, [filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('rounded-full px-3 py-1.5 text-sm', filter === f ? 'bg-ink text-white' : 'bg-white text-gray-600')}>
            {f === 'all' ? 'الكل' : VERIFICATION_LABEL[f]}
          </button>
        ))}
      </div>
      <ErrorBox message={list.error} onRetry={list.reload} />
      {list.loading ? <Spinner /> : list.data?.length ? (
        list.data.map((v) => <VerificationItem key={v.id} v={v} onDone={list.reload} />)
      ) : (
        <EmptyState icon={<ShieldCheck className="h-10 w-10" />} title="ماكو طلبات بهالحالة" />
      )}
    </div>
  );
}

function VerificationItem({ v, onDone }: { v: VerificationRequest; onDone: () => void }) {
  const [notes, setNotes] = useState(v.admin_notes ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);

  // Shown inline (window.open after an await is popup-blocked on phones).
  async function openDoc() {
    const url = await signedUrl('verification-docs', v.document_path);
    if (url) setDocUrl(url);
    else setError('ما گدرنا نفتح الملف (ملف تجريبي أو محذوف)');
  }

  async function decide(decision: VerificationStatus) {
    if (decision !== 'verified' && !notes.trim()) return setError('اكتب سبب/ملاحظة للفني');
    setBusy(decision);
    setError(null);
    const { error } = await supabase.rpc('review_verification', {
      p_verification_id: v.id, p_decision: decision, p_notes: notes.trim() || null,
    });
    setBusy(null);
    if (error) return setError(errorMessage(error));
    onDone();
  }

  const p = v.providers;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Link to={`/providers/${p?.id}`} className="font-bold text-ink">{p?.display_name}</Link>
            <DemoBadge show={v.is_demo} />
          </div>
          <p className="text-sm text-gray-500">
            {p?.services?.name_ar} · {p?.area}، {p?.city} · {p?.years_experience} سنين خبرة
          </p>
          <p className="text-xs text-gray-400">{timeAgo(v.created_at)}</p>
        </div>
        <Badge tone={v.status === 'verified' ? 'green' : v.status === 'rejected' ? 'red' : 'orange'}>
          {VERIFICATION_LABEL[v.status]}
        </Badge>
      </div>
      {v.provider_note && <p className="rounded-xl bg-surface p-2.5 text-sm">ملاحظة الفني: {v.provider_note}</p>}
      {docUrl ? (
        <div className="space-y-1">
          {v.document_path.endsWith('.pdf') ? null : (
            <img src={docUrl} alt="مستند التوثيق" className="max-h-80 w-full rounded-2xl bg-surface object-contain" />
          )}
          <a href={docUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline">
            فتح المستند بصفحة جديدة (الرابط ينتهي خلال 10 دقايق)
          </a>
        </div>
      ) : (
        <Button variant="outline" size="md" onClick={openDoc}>
          <FileText className="h-4 w-4" /> عرض المستند (رابط خاص مؤقت)
        </Button>
      )}
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات الإدارة (تظهر للفني)" />
      <ErrorBox message={error} />
      {['pending', 'needs_info'].includes(v.status) && (
        <div className="grid grid-cols-3 gap-2">
          <Button size="md" loading={busy === 'verified'} disabled={!!busy} onClick={() => decide('verified')}>قبول</Button>
          <Button size="md" variant="outline" loading={busy === 'needs_info'} disabled={!!busy} onClick={() => decide('needs_info')}>طلب معلومات</Button>
          <Button size="md" variant="danger" loading={busy === 'rejected'} disabled={!!busy} onClick={() => decide('rejected')}>رفض</Button>
        </div>
      )}
      {v.status === 'verified' && (
        <Button size="md" variant="danger" loading={busy === 'rejected'} onClick={() => decide('rejected')}>سحب التوثيق</Button>
      )}
    </Card>
  );
}
