import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { must, useLoad } from '../../lib/useLoad';
import type {
  Complaint, ComplaintStatus, Profile, Provider, RequestStatus, Review, Service, ServiceRequest, UserRole,
} from '../../lib/types';
import { COMPLAINT_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from '../../lib/constants';
import { cn, errorMessage, formatDate, isPhoneAccount, timeAgo } from '../../lib/utils';
import { StatusBadge } from '../../components/cards';
import { ICON_NAMES, ServiceIcon } from '../../components/ServiceIcon';
import {
  Badge, Button, Card, DemoBadge, EmptyState, ErrorBox, Input, RatingInline, Select, Spinner, Stars, Textarea,
} from '../../components/ui';

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <Input className="!py-2.5 ps-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Pills<T extends string>({ options, value, onChange, label }: {
  options: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={cn('rounded-full px-3 py-1.5 text-sm', value === o ? 'bg-ink text-white' : 'bg-white text-gray-600')}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

// =====================================================================
// Users
// =====================================================================
export function AdminUsers() {
  const { profile: me } = useAuth();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | 'all'>('all');
  const [err, setErr] = useState<string | null>(null);
  const users = useLoad(async () =>
    must(await supabase.from('users').select('*').order('created_at', { ascending: false }).limit(500)) as Profile[],
  );

  const list = useMemo(() => (users.data ?? []).filter((u) =>
    (role === 'all' || u.role === role) &&
    (!q || u.full_name.includes(q) || u.email?.includes(q) || u.phone?.includes(q)),
  ), [users.data, q, role]);

  async function resetPassword(u: Profile) {
    const pw = prompt(`رمز جديد لـ ${u.full_name} (6 أحرف أو أكثر):`);
    if (!pw) return;
    setErr(null);
    const { error } = await supabase.rpc('admin_reset_password', { p_user_id: u.id, p_password: pw });
    if (error) setErr(errorMessage(error));
    else alert('تم تغيير الرمز. بلّغ صاحب الحساب بالرمز الجديد.');
  }

  async function setUser(id: string, patch: { p_role?: UserRole; p_is_active?: boolean }) {
    setErr(null);
    const { error } = await supabase.rpc('admin_set_user', { p_user_id: id, p_role: null, p_is_active: null, ...patch });
    if (error) setErr(errorMessage(error));
    users.reload();
  }

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="اسم، إيميل أو رقم" />
      <Pills options={['all', 'customer', 'provider', 'admin'] as const} value={role} onChange={setRole}
        label={(r) => ({ all: 'الكل', customer: 'زبائن', provider: 'فنيين', admin: 'إدارة' })[r]} />
      <ErrorBox message={err ?? users.error} />
      {users.loading ? <Spinner /> : (
        <>
          <p className="text-xs text-gray-500">{list.length} مستخدم</p>
          {list.map((u) => (
            <Card key={u.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink">{u.full_name || '—'}</span>
                    <DemoBadge show={u.is_demo} />
                    {!u.is_active && <Badge tone="red">موقوف</Badge>}
                  </div>
                  <p className="truncate text-sm text-gray-500" dir="ltr">
                    {isPhoneAccount(u.email) ? u.phone : `${u.email} · ${u.phone ?? ''}`}
                  </p>
                  <p className="text-xs text-gray-400">سجّل {formatDate(u.created_at)} · {u.area ?? '—'}</p>
                </div>
              </div>
              {u.id !== me?.id && (
                <div className="flex gap-2">
                  <Select className="!py-2 text-sm" value={u.role} onChange={(e) => setUser(u.id, { p_role: e.target.value as UserRole })}>
                    <option value="customer">زبون</option>
                    <option value="provider">فني</option>
                    <option value="admin">مدير</option>
                  </Select>
                  <Button size="sm" variant={u.is_active ? 'danger' : 'primary'} onClick={() => setUser(u.id, { p_is_active: !u.is_active })}>
                    {u.is_active ? 'إيقاف' : 'تفعيل'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => resetPassword(u)}>الرمز</Button>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

// =====================================================================
// Providers
// =====================================================================
export function AdminProviders() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('all');
  const providers = useLoad(async () =>
    must(await supabase.from('providers').select('*, services(id, slug, name_ar, icon)').order('created_at', { ascending: false })) as Provider[],
  );
  const list = (providers.data ?? []).filter((p) =>
    (status === 'all' || p.verification_status === status) && (!q || p.display_name.includes(q) || p.area.includes(q)));

  async function toggleAvailable(p: Provider) {
    await supabase.from('providers').update({ is_available: !p.is_available }).eq('id', p.id);
    providers.reload();
  }

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="اسم الفني أو المنطقة" />
      <Pills options={['all', 'verified', 'pending', 'needs_info', 'rejected', 'unverified']} value={status} onChange={setStatus}
        label={(s) => (s === 'all' ? 'الكل' : VERIFICATION_LABEL[s as keyof typeof VERIFICATION_LABEL])} />
      <ErrorBox message={providers.error} />
      {providers.loading ? <Spinner /> : list.map((p) => (
        <Card key={p.id} className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Link to={`/providers/${p.id}`} className="font-bold text-ink">{p.display_name}</Link>
                <DemoBadge show={p.is_demo} />
              </div>
              <p className="text-sm text-gray-500">{p.services?.name_ar} · {p.area}، {p.city} · {p.years_experience} سنين</p>
              <div className="mt-1 flex items-center gap-3 text-sm">
                <RatingInline avg={p.rating_avg} count={p.rating_count} />
                <span className="text-gray-500">{p.completed_jobs} شغلة</span>
              </div>
            </div>
            <Badge tone={p.verification_status === 'verified' ? 'blue' : p.verification_status === 'rejected' ? 'red' : 'orange'}>
              {VERIFICATION_LABEL[p.verification_status]}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={p.is_available ? 'green' : 'gray'}>{p.is_available ? 'متاح' : 'غير متاح'}</Badge>
            <div className="flex-1" />
            {p.is_available && <Button size="sm" variant="outline" onClick={() => toggleAvailable(p)}>إيقاف التوفر</Button>}
            <Link to="/admin/verifications" className="text-sm font-semibold text-primary">التوثيق</Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

// =====================================================================
// Services
// =====================================================================
export function AdminServices() {
  const services = useLoad(async () =>
    must(await supabase.from('services').select('*').order('sort_order')) as Service[],
  );
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {services.loading ? <Spinner /> : services.data?.map((s) => <ServiceEditor key={s.id} s={s} onSaved={services.reload} />)}
      {adding ? (
        <ServiceEditor onSaved={() => { setAdding(false); services.reload(); }} />
      ) : (
        <Button variant="outline" full onClick={() => setAdding(true)}><Plus className="h-5 w-5" /> إضافة خدمة</Button>
      )}
    </div>
  );
}

function ServiceEditor({ s, onSaved }: { s?: Service; onSaved: () => void }) {
  const [open, setOpen] = useState(!s);
  const [name, setName] = useState(s?.name_ar ?? '');
  const [slug, setSlug] = useState(s?.slug ?? '');
  const [icon, setIcon] = useState(s?.icon ?? 'wrench');
  const [desc, setDesc] = useState(s?.description_ar ?? '');
  const [problems, setProblems] = useState((s?.problem_types ?? ['شي ثاني']).join('\n'));
  const [order, setOrder] = useState(String(s?.sort_order ?? 99));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(patch?: Partial<Service>) {
    setBusy(true);
    setErr(null);
    const row = patch ?? {
      name_ar: name.trim(), slug: slug.trim(), icon, description_ar: desc.trim() || null,
      problem_types: problems.split('\n').map((x) => x.trim()).filter(Boolean), sort_order: Number(order) || 0,
    };
    const res = s ? await supabase.from('services').update(row).eq('id', s.id) : await supabase.from('services').insert(row);
    setBusy(false);
    if (res.error) return setErr(errorMessage(res.error));
    if (!patch) setOpen(false);
    onSaved();
  }

  if (!open && s) {
    return (
      <Card className="flex items-center gap-3">
        <span className="rounded-xl bg-accent-50 p-2 text-accent"><ServiceIcon name={s.icon} className="h-5 w-5" /></span>
        <div className="flex-1">
          <p className="font-bold text-ink">{s.name_ar}</p>
          <p className="text-xs text-gray-500">{s.problem_types.length} نوع مشكلة · ترتيب {s.sort_order}</p>
        </div>
        <Badge tone={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'فعالة' : 'مخفية'}</Badge>
        <Button size="sm" variant="outline" onClick={() => save({ is_active: !s.is_active })} loading={busy}>
          {s.is_active ? 'إخفاء' : 'تفعيل'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>تعديل</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="slug (إنگليزي)" dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} disabled={!!s} />
        <Select value={icon} onChange={(e) => setIcon(e.target.value)}>
          {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </Select>
        <Input type="number" placeholder="الترتيب" value={order} onChange={(e) => setOrder(e.target.value)} />
      </div>
      <Input placeholder="وصف قصير" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <Textarea rows={5} value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="أنواع المشاكل، كل نوع بسطر" />
      <ErrorBox message={err} />
      <div className="flex gap-2">
        <Button full size="md" loading={busy} disabled={!name.trim() || !slug.trim()} onClick={() => save()}>حفظ</Button>
        {s && <Button size="md" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>}
      </div>
    </Card>
  );
}

// =====================================================================
// Requests
// =====================================================================
const REQ_FILTERS: (RequestStatus | 'all' | 'active')[] = ['active', 'all', 'MATCHING', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'RATED', 'CANCELLED'];

export function AdminRequests() {
  const [status, setStatus] = useState<(typeof REQ_FILTERS)[number]>('active');
  const reqs = useLoad(async () => {
    let q = supabase.from('service_requests')
      .select('*, services(id, slug, name_ar, icon), providers(id, display_name, avatar_url, rating_avg, is_demo)')
      .order('created_at', { ascending: false }).limit(200);
    if (status === 'active') q = q.in('status', ['NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS']);
    else if (status !== 'all') q = q.eq('status', status);
    return must(await q) as ServiceRequest[];
  }, [status]);

  return (
    <div className="space-y-3">
      <Pills options={REQ_FILTERS} value={status} onChange={setStatus}
        label={(s) => (s === 'all' ? 'الكل' : s === 'active' ? 'الشغالة' : STATUS_LABEL[s])} />
      <ErrorBox message={reqs.error} />
      {reqs.loading ? <Spinner /> : reqs.data?.length ? reqs.data.map((r) => (
        <Link key={r.id} to={`/requests/${r.id}`} className="block rounded-3xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink">{r.services?.name_ar}</span>
              <DemoBadge show={r.is_demo} />
            </div>
            <StatusBadge status={r.status} />
          </div>
          <p className="text-sm text-gray-500">{r.problem_type} · {r.area}، {r.city}</p>
          <p className="mt-1 text-xs text-gray-400">
            {timeAgo(r.created_at)} {r.providers ? `· الفني: ${r.providers.display_name}` : ''}
          </p>
        </Link>
      )) : <EmptyState title="ماكو طلبات" />}
    </div>
  );
}

// =====================================================================
// Complaints
// =====================================================================
export function AdminComplaints() {
  const [status, setStatus] = useState<ComplaintStatus | 'all'>('open');
  const list = useLoad(async () => {
    let q = supabase.from('complaints').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    return must(await q) as Complaint[];
  }, [status]);

  return (
    <div className="space-y-3">
      <Pills options={['open', 'in_review', 'resolved', 'rejected', 'all'] as const} value={status} onChange={setStatus}
        label={(s) => (s === 'all' ? 'الكل' : COMPLAINT_LABEL[s])} />
      <ErrorBox message={list.error} />
      {list.loading ? <Spinner /> : list.data?.length
        ? list.data.map((c) => <ComplaintItem key={c.id} c={c} onSaved={list.reload} />)
        : <EmptyState title="ماكو شكاوى بهالحالة" />}
    </div>
  );
}

function ComplaintItem({ c, onSaved }: { c: Complaint; onSaved: () => void }) {
  const [st, setSt] = useState<ComplaintStatus>(c.status);
  const [notes, setNotes] = useState(c.admin_notes ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from('complaints').update({ status: st, admin_notes: notes.trim() || null }).eq('id', c.id);
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    onSaved();
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink">{c.subject}</span>
          <DemoBadge show={c.is_demo} />
        </div>
        <Badge tone={c.status === 'resolved' ? 'green' : c.status === 'rejected' ? 'gray' : 'orange'}>{COMPLAINT_LABEL[c.status]}</Badge>
      </div>
      <p className="text-sm text-gray-600">{c.details}</p>
      <p className="text-xs text-gray-400">
        {timeAgo(c.created_at)} · <Link className="text-primary underline" to={`/requests/${c.request_id}`}>فتح الطلب</Link>
        {c.provider_id && <> · <Link className="text-primary underline" to={`/providers/${c.provider_id}`}>الفني</Link></>}
      </p>
      <Select className="!py-2.5" value={st} onChange={(e) => setSt(e.target.value as ComplaintStatus)}>
        {(Object.keys(COMPLAINT_LABEL) as ComplaintStatus[]).map((k) => <option key={k} value={k}>{COMPLAINT_LABEL[k]}</option>)}
      </Select>
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات الإدارة (تظهر للزبون)" />
      <ErrorBox message={err} />
      <Button size="md" full loading={busy} onClick={save}>حفظ</Button>
    </Card>
  );
}

// =====================================================================
// Reviews
// =====================================================================
export function AdminReviews() {
  const [filter, setFilter] = useState<'all' | 'low' | 'hidden'>('all');
  const list = useLoad(async () => {
    let q = supabase.from('reviews').select('*, providers(display_name)').order('created_at', { ascending: false }).limit(300);
    if (filter === 'low') q = q.lte('rating', 2);
    if (filter === 'hidden') q = q.eq('is_hidden', true);
    return must(await q) as (Review & { providers: { display_name: string } | null })[];
  }, [filter]);

  async function toggle(r: Review) {
    await supabase.from('reviews').update({ is_hidden: !r.is_hidden }).eq('id', r.id);
    list.reload();
  }

  return (
    <div className="space-y-3">
      <Pills options={['all', 'low', 'hidden'] as const} value={filter} onChange={setFilter}
        label={(f) => ({ all: 'الكل', low: 'تقييم واطي (≤2)', hidden: 'المخفية' })[f]} />
      <ErrorBox message={list.error} />
      {list.loading ? <Spinner /> : list.data?.length ? list.data.map((r) => (
        <Card key={r.id} className={cn('space-y-1', r.is_hidden && 'opacity-60')}>
          <div className="flex items-center justify-between">
            <span className="text-sm">
              <b>{r.customer_name}</b> ← <Link to={`/providers/${r.provider_id}`} className="text-primary">{r.providers?.display_name}</Link>
            </span>
            <Stars value={r.rating} size={14} />
          </div>
          {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-400">{timeAgo(r.created_at)} {r.is_demo && '· تجريبي'}</span>
            <Button size="sm" variant={r.is_hidden ? 'primary' : 'outline'} onClick={() => toggle(r)}>
              {r.is_hidden ? 'إظهار' : 'إخفاء'}
            </Button>
          </div>
        </Card>
      )) : <EmptyState title="ماكو تقييمات" />}
    </div>
  );
}
