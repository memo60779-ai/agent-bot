import { Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Briefcase } from 'lucide-react';
import type { Provider, ServiceRequest } from '../lib/types';
import { STATUS_LABEL, STATUS_TONE } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import { AvailableBadge, Avatar, Badge, DemoBadge, FounderBadge, JobsOrYears, RatingInline, VerifiedBadge } from './ui';
import { ServiceBadge } from './ServiceIcon';

export function StatusBadge({ status }: { status: ServiceRequest['status'] }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function ProviderCard({ p, action }: { p: Provider; action?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <Link to={`/providers/${p.id}`} className="flex gap-3">
        <Avatar name={p.display_name} url={p.avatar_url} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-bold text-ink">{p.display_name}</span>
            <DemoBadge show={p.is_demo} />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
            {p.services?.name_ar}
            <FounderBadge code={p.public_code} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <RatingInline avg={p.rating_avg} count={p.rating_count} />
            {(p.completed_jobs > 0 || p.years_experience > 0) && (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <Briefcase className="h-3.5 w-3.5" /> <JobsOrYears jobs={p.completed_jobs} years={p.years_experience} />
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-gray-500">
              <MapPin className="h-3.5 w-3.5" /> {p.area}
            </span>
          </div>
        </div>
        <ChevronLeft className="mt-4 h-5 w-5 shrink-0 text-gray-300" />
      </Link>
      <div className="mt-3 flex items-center gap-2">
        {p.verification_status === 'verified' && <VerifiedBadge />}
        <AvailableBadge available={p.is_available} />
        <div className="flex-1" />
        {action}
      </div>
    </div>
  );
}

export function RequestCard({ r, to }: { r: ServiceRequest; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-3xl bg-white p-4 shadow-card">
      <ServiceBadge icon={r.services?.icon ?? 'wrench'} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-bold text-ink">{r.services?.name_ar}</span>
          <DemoBadge show={r.is_demo} />
        </div>
        <div className="truncate text-sm text-gray-500">{r.problem_type} · {r.area}</div>
        <div className="mt-1 text-xs text-gray-400">{timeAgo(r.created_at)}</div>
      </div>
      <StatusBadge status={r.status} />
    </Link>
  );
}
