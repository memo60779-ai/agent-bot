import { useState } from 'react';
import { BadgeCheck, Clock, FileUp, ImagePlus, Info, Trash2, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { PortfolioItem, VerificationRequest } from '../../lib/types';
import { errorMessage, formatDate, publicUrl, uploadFile } from '../../lib/utils';
import { Button, Card, ErrorBox, Field, Input, Spinner } from '../../components/ui';

/** Verification status banner + upload form (document goes to the PRIVATE bucket). */
export function VerificationPanel({ onSubmitted }: { onSubmitted?: () => void }) {
  const { provider, refresh } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const history = useLoad(async () =>
    must(
      await supabase.from('verification_requests').select('*').eq('provider_id', provider!.id)
        .order('created_at', { ascending: false }).limit(1),
    ) as VerificationRequest[],
  [provider?.id, provider?.verification_status]);

  if (!provider) return null;
  const status = provider.verification_status;
  const last = history.data?.[0];

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadFile('verification-docs', provider!.id, file);
      const { error } = await supabase.rpc('submit_verification', { p_document_path: path, p_note: note.trim() || null });
      if (error) throw error;
      await refresh();
      onSubmitted?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (status === 'verified') {
    return (
      <Card className="flex items-center gap-3 bg-primary-50">
        <BadgeCheck className="h-8 w-8 text-primary" />
        <div>
          <p className="font-bold text-primary">حسابك موثق</p>
          {provider.verified_at && <p className="text-sm text-primary/70">من {formatDate(provider.verified_at)}</p>}
        </div>
      </Card>
    );
  }
  if (status === 'pending') {
    return (
      <Card className="flex items-center gap-3 bg-accent-50">
        <Clock className="h-8 w-8 shrink-0 text-accent" />
        <div>
          <p className="font-bold text-accent-600">طلب التوثيق قيد المراجعة</p>
          <p className="text-sm text-accent-600/80">نراجع معلوماتك خلال 24 ساعة. بعد الموافقة تگدر تشغّل "متاح الآن" وتستلم طلبات.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      {status === 'needs_info' && (
        <div className="flex gap-2 rounded-2xl bg-accent-50 p-3 text-sm text-accent-600">
          <Info className="h-5 w-5 shrink-0" />
          <div><b>الإدارة طلبت معلومات إضافية:</b> {last?.admin_notes ?? '—'}</div>
        </div>
      )}
      {status === 'rejected' && (
        <div className="flex gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
          <XCircle className="h-5 w-5 shrink-0" />
          <div><b>انرفض طلب التوثيق:</b> {last?.admin_notes ?? '—'}. تگدر تقدّم من جديد.</div>
        </div>
      )}
      <div>
        <p className="font-bold text-ink">وثّق حسابك</p>
        <p className="text-sm text-gray-500">
          ارفع صورة الهوية الوطنية أو هوية الأحوال. الملف <b>ما يظهر لأي أحد</b> غير إدارة فني.
        </p>
      </div>
      <label className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-surface p-4 text-center text-gray-500">
        <FileUp className="h-7 w-7" />
        <span className="text-sm font-semibold">{file ? file.name : 'اختار صورة الهوية أو ملف PDF'}</span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <Field label="ملاحظة للإدارة (اختياري)">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: عندي إجازة مهنية" maxLength={300} />
      </Field>
      <ErrorBox message={error} />
      <Button full variant="accent" loading={busy} disabled={!file} onClick={submit}>أرسل طلب التوثيق</Button>
    </Card>
  );
}

/** Portfolio grid with upload + delete. */
export function PortfolioManager() {
  const { provider } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = useLoad(async () =>
    must(
      await supabase.from('provider_portfolio').select('*').eq('provider_id', provider!.id)
        .order('created_at', { ascending: false }),
    ) as PortfolioItem[],
  [provider?.id]);

  async function add(files: FileList | null) {
    if (!files?.length || !provider) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        const path = await uploadFile('portfolio', provider.id, f);
        const { error } = await supabase.from('provider_portfolio').insert({
          provider_id: provider.id, image_url: publicUrl('portfolio', path),
        });
        if (error) throw error;
      }
      await items.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('تحذف هذي الصورة؟')) return;
    await supabase.from('provider_portfolio').delete().eq('id', id);
    items.reload();
  }

  return (
    <div>
      <ErrorBox message={error} />
      <div className="grid grid-cols-3 gap-2">
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gray-200 bg-white text-gray-500">
          {busy ? <Spinner className="py-0" /> : <ImagePlus className="h-7 w-7" />}
          <span className="text-xs font-semibold">أضف صور</span>
          <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => add(e.target.files)} />
        </label>
        {items.data?.map((it) => (
          <div key={it.id} className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
            <img src={it.image_url} alt="" className="h-full w-full object-cover" />
            <button onClick={() => remove(it.id)} className="absolute end-1 top-1 rounded-full bg-black/60 p-1.5 text-white" aria-label="حذف">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
