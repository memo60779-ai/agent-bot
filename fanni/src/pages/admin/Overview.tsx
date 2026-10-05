import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, CheckCircle2, ClipboardList, Clock, FlaskConical, KeyRound, Star, Users, Wrench, XCircle,
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

interface DemandRow {
  service: string; area: string; requests: number; accepted: number; unanswered: number;
  avg_accept_minutes: number | null; providers: number;
}

/** Where do customers wait in vain? Per service + area, last 30 days (demo data excluded). */
function DemandTable({ rows }: { rows: DemandRow[] }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="font-bold text-ink">وين ناقصني فنيين؟</p>
      <p className="mb-3 text-xs text-gray-500">آخر 30 يوم، حسب الخدمة والمنطقة. الأحمر يعني زبائن ما لگوا فني.</p>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">بعد ماكو طلبات حقيقية.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="px-1 py-2 text-start font-semibold">الخدمة</th>
                <th className="px-1 py-2 font-semibold">طلبات</th>
                <th className="px-1 py-2 font-semibold">انقبلت</th>
                <th className="px-1 py-2 font-semibold">بدون فني</th>
                <th className="px-1 py-2 font-semibold">يقبلون خلال</th>
                <th className="px-1 py-2 font-semibold">فنيين</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rate = r.requests ? Math.round((r.accepted / r.requests) * 100) : 0;
                const bad = r.unanswered > 0 || r.providers === 0;
                return (
                  <tr key={`${r.service}-${r.area}`} className={`border-t border-gray-100 ${bad ? 'bg-red-50/60' : ''}`}>
                    <td className="px-1 py-2 font-semibold text-ink">{r.service}<span className="block font-normal text-gray-500">{r.area}</span></td>
                    <td className="px-1 py-2 text-center">{r.requests}</td>
                    <td className="px-1 py-2 text-center">{rate}%</td>
                    <td className={`px-1 py-2 text-center font-bold ${r.unanswered ? 'text-red-600' : 'text-gray-400'}`}>{r.unanswered}</td>
                    <td className="px-1 py-2 text-center">{r.avg_accept_minutes != null ? `${r.avg_accept_minutes} د` : '—'}</td>
                    <td className={`px-1 py-2 text-center font-bold ${r.providers === 0 ? 'text-red-600' : 'text-ink'}`}>{r.providers}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Overview() {
  const { data, loading, error, reload } = useLoad(async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const [{ data, error }, resets, waiting, demand] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase.rpc('admin_password_resets'),
      supabase.from('service_requests').select('id', { count: 'exact', head: true })
        .in('status', ['NEW', 'MATCHING']).eq('is_demo', false).lt('created_at', tenMinAgo),
      supabase.rpc('admin_demand_stats', { p_days: 30 }),
    ]);
    if (error) throw error;
    return {
      ...(data as Stats),
      password_resets: ((resets.data as unknown[] | null) ?? []).length,
      waiting: waiting.count ?? 0,
      // older databases without the stale-alert update simply hide the table
      demand: (demand.data as DemandRow[] | null) ?? null,
    };
  });

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error} onRetry={reload} />;
  const s = data;
  const ic = 'h-5 w-5';
  const completionRate = s.requests ? Math.round((s.completed_requests / s.requests) * 100) : 0;

  return (
    <div className="space-y-4">
      {s.waiting > 0 && (
        <Link to="/admin/requests" className="flex animate-pulse-ring items-center gap-3 rounded-3xl bg-red-50 p-4 font-bold text-red-700">
          <AlertTriangle className="h-6 w-6" /> {s.waiting} طلب ينتظر فني من أكثر من 10 دقايق، اتصل بفني هسه
        </Link>
      )}
      {s.pending_verifications > 0 && (
        <Link to="/admin/verifications" className="flex items-center gap-3 rounded-3xl bg-accent-50 p-4 font-semibold text-accent-600">
          <Clock className="h-6 w-6" /> {s.pending_verifications} طلب توثيق بانتظار المراجعة
        </Link>
      )}
      <PushCard audience="admin" />
      {s.password_resets > 0 && (
        <Link to="/admin/users" className="flex items-center gap-3 rounded-3xl bg-accent-50 p-4 font-semibold text-accent-600">
          <KeyRound className="h-6 w-6" /> {s.password_resets} طلب استعادة رمز بانتظارك
        </Link>
      )}
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
      {s.demand && <DemandTable rows={s.demand} />}
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
