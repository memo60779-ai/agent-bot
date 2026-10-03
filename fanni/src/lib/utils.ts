import { supabase } from './supabase';

// Arabic messages for the error codes raised by our SQL functions / Supabase.
const ERRORS: Record<string, string> = {
  not_allowed: 'ما عندك صلاحية لهذا الإجراء',
  request_not_open: 'الطلب ما بعد مفتوح',
  provider_not_eligible: 'هذا الفني ما متاح لهذي الخدمة',
  too_many_offers: 'دزيت الطلب لـ5 فنيين، انتظر ردهم أول',
  already_offered: 'الطلب مندز لهذا الفني من قبل',
  offer_not_open: 'هذا الطلب ما بعد متاح',
  provider_not_verified: 'لازم حسابك يكون موثق حتى تستلم طلبات',
  request_already_taken: 'فني ثاني سبقك وقبل الطلب',
  invalid_transition: 'ما تگدر تغيّر الحالة بهالشكل',
  cannot_cancel_in_progress: 'الشغل بدأ، ما تگدر تلغي هسه. تواصل ويا الفني',
  request_not_completed: 'التقييم يصير بس بعد ما يكتمل الطلب',
  already_reviewed: 'قيّمت هذا الطلب من قبل',
  provider_profile_missing: 'كمّل ملفك كفني أول',
  verification_already_pending: 'طلب التوثيق مالتك قيد المراجعة',
  verification_already_verified: 'حسابك موثق',
  invalid_document_path: 'ملف التوثيق غير صالح',
  cannot_change_self: 'ما تگدر تعطل حسابك أو تغير دورك',
  'Invalid login credentials': 'الإيميل أو الرمز غلط',
  'User already registered': 'هذا الإيميل مسجل من قبل، سجّل دخول',
  'Email not confirmed': 'لازم تأكد الإيميل أول',
};

export function errorMessage(err: unknown): string {
  const raw =
    typeof err === 'string' ? err : (err as { message?: string } | null)?.message ?? 'صار خطأ، جرّب مرة ثانية';
  for (const key of Object.keys(ERRORS)) {
    if (raw.includes(key)) return ERRORS[key];
  }
  if (raw.includes('row-level security')) return ERRORS.not_allowed;
  if (raw.toLowerCase().includes('password')) return 'الرمز لازم يكون 6 أحرف أو أكثر';
  if (raw.includes('Failed to fetch')) return 'ماكو اتصال بالإنترنت أو السيرفر';
  return raw;
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'هسه';
  const m = Math.floor(diff / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  if (d < 30) return `قبل ${d} يوم`;
  return formatDate(iso);
}

export function formatDate(iso: string, withTime = false): string {
  return new Date(iso).toLocaleDateString('ar-IQ', {
    year: 'numeric', month: 'long', day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

/** Resize to max 1600px & re-encode as JPEG to save mobile data before upload. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality));
}

/** Uploads into `{bucket}/{userId}/{random}.ext` (storage policies require the user folder). */
export async function uploadFile(bucket: string, userId: string, file: File): Promise<string> {
  const isImage = file.type.startsWith('image/');
  const body = isImage ? await compressImage(file) : file;
  const ext = isImage ? 'jpg' : (file.name.split('.').pop() || 'bin');
  // (crypto.randomUUID needs HTTPS; this works when testing over LAN http too)
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const path = `${userId}/${id}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, body, { contentType: isImage ? 'image/jpeg' : file.type, upsert: false });
  if (error) throw error;
  return path;
}

export function publicUrl(bucket: string, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function signedUrl(bucket: string, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export function telLink(phone: string) {
  return `tel:${phone.replace(/\s/g, '')}`;
}

export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^0/, '964');
  return `https://wa.me/${digits}`;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
