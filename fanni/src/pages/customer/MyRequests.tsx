import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type { ServiceRequest } from '../../lib/types';
import { RequestCard } from '../../components/cards';
import { EmptyState, ErrorBox, LinkButton, PageHeader, Spinner } from '../../components/ui';
import { cn } from '../../lib/utils';

const ACTIVE = ['NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED'];

export default function MyRequests() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const { data, loading, error, reload } = useLoad(async () =>
    must(
      await supabase
        .from('service_requests')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('customer_id', profile!.id)
        .order('created_at', { ascending: false }),
    ) as ServiceRequest[],
  [profile?.id]);

  const list = (data ?? []).filter((r) => (tab === 'active' ? ACTIVE.includes(r.status) : !ACTIVE.includes(r.status)));

  return (
    <div>
      <PageHeader title="طلباتي" />
      <div className="mb-4 flex rounded-2xl bg-white p-1 shadow-card">
        {(['active', 'done'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('flex-1 rounded-xl py-2.5 text-sm font-semibold', tab === t ? 'bg-primary text-white' : 'text-gray-500')}
          >
            {t === 'active' ? 'الحالية' : 'المنتهية'}
          </button>
        ))}
      </div>
      <ErrorBox message={error} onRetry={reload} />
      {loading ? (
        <Spinner />
      ) : list.length ? (
        <div className="space-y-3">
          {list.map((r) => <RequestCard key={r.id} r={r} to={`/requests/${r.id}`} />)}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title={tab === 'active' ? 'ماكو طلبات حالية' : 'ماكو طلبات منتهية'}
          action={<LinkButton to="/request/new" variant="accent">اطلب خدمة</LinkButton>}
        />
      )}
    </div>
  );
}
