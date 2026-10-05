import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, ClipboardList, Clock, FlaskConical, Star, Users, Wrench, XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useLoad } from '../../lib/useLoad';
import { ErrorBox, Spinner } from '../../components/ui';
import { TelegramCard } from '../provider/TelegramCard';
import { PushCard } from '../../components/PushCard';

interface Stats {
  customers: number; providers: number; verified_providers: number; pending_verifications: number;
  requests: number; completed_requests: number; cancelled_requests: number; active_requests: number;
  avg_rating: number; reviews: number; open_complaints: number; demo_rows: number;
}

function Tile({ label, value, icon, to, tone = 'text-primary' }: {
  label: string; value: ReactNode; icon: ReactNode; to?: string; tone?: string;
}) {
  const body = (
    <div className="flex h-full items-center gap-3 rounded-3xl bg-white p-4 shadow-card">
      <span className={`rounded-2xl bg-surface p-2.5 ${tone}`}>{icon}</span>
      <div>
        <div className="text-2xl font-bold text-ink">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
      </div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function Overview() {
  const { data, loading, error, reload } = useLoad(async () => {
    const { data, error } = await supabase.rpc('admin_stats');
    if (error) throw error;
    return data as Stats;
  });

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  const s = data;
  const ic = 'h-5 w-5';
  const completionRate = s.requests ? Math.round((s.completed_requests / s.requests) * 100) : 0;

  return (
    <div className="space-y-4">
      {s.pending_verifications > 0 && (
        <Link to="/admin/verifications" className="flex items-center gap-3 rounded-3xl bg-accent-50 p-4 font-semibold text-accent-600">
          <Clock className="h-6 w-6" /> {s.pending_verifications} طلب توثيق بانتظار المراجعة
        </Link>
      )}
      <PushCard audience="admin" />
      <TelegramCard
        title="إشعارات الإدارة"
        text="تجيك رسالة على تليكرام أول ما يقدّم فني على التوثيق، حتى توافق بدقيقة."
        linkedText="توصلك طلبات التوثيق الجديدة فوراً"
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="العملاء" value={s.customers} icon={<Users className={ic} />} to="/admin/users" />
        <Tile label="الفنيين" value={s.providers} icon={<Wrench className={ic} />} to="/admin/providers" />
        <Tile label="فنيين موثقين" value={s.verified_providers} icon={<BadgeCheck className={ic} />} to="/admin/providers" />
        <Tile label="كل الطلبات" value={s.requests} icon={<ClipboardList className={ic} />} to="/admin/requests" />
        <Tile label={`مكتملة (${completionRate}%)`} value={s.completed_requests} icon={<CheckCircle2 className={ic} />} tone="text-emerald-600" />
        <Tile label="ملغاة" value={s.cancelled_requests} icon={<XCircle className={ic} />} tone="text-red-500" />
        <Tile label="طلبات شغالة هسه" value={s.active_requests} icon={<Clock className={ic} />} tone="text-accent" />
        <Tile label={`متوسط التقييم (${s.reviews})`} value={Number(s.avg_rating).toFixed(2)} icon={<Star className={ic} />} tone="text-accent" to="/admin/reviews" />
        <Tile label="شكاوى مفتوحة" value={s.open_complaints} icon={<AlertTriangle className={ic} />} tone="text-red-500" to="/admin/complaints" />
      </div>
      {s.demo_rows > 0 && (
        <div className="flex gap-3 rounded-3xl border border-accent/30 bg-white p-4 text-sm">
          <FlaskConical className="h-5 w-5 shrink-0 text-accent" />
          <p>
            القاعدة بيها <b>{s.demo_rows}</b> حساب تجريبي (is_demo). الأرقام فوق تشملهم.
            قبل الإطلاق شغّل <code className="rounded bg-surface px-1">supabase/cleanup_demo.sql</code>.
          </p>
        </div>
      )}
    </div>
  );
}
