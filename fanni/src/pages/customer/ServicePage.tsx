import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { must, useLoad } from '../../lib/useLoad';
import type { Provider, Service } from '../../lib/types';
import { PROVINCE } from '../../lib/constants';
import { ServiceIcon } from '../../components/ServiceIcon';
import { ProviderCard } from '../../components/cards';
import { EmptyState, ErrorBox, LinkButton, PageHeader, Spinner } from '../../components/ui';

export default function ServicePage() {
  const { slug } = useParams();
  const { data, loading, error, reload } = useLoad(async () => {
    const service = must(await supabase.from('services').select('*').eq('slug', slug!).single()) as Service;
    const providers = must(
      await supabase
        .from('providers')
        .select('*, services(id, slug, name_ar, icon)')
        .eq('service_id', service.id)
        .eq('province', PROVINCE)
        .eq('verification_status', 'verified')
        .order('is_available', { ascending: false })
        .order('rating_avg', { ascending: false })
        .order('completed_jobs', { ascending: false }),
    ) as Provider[];
    return { service, providers };
  }, [slug]);

  if (loading) return <Spinner className="pt-32" />;
  if (error || !data) return <div className="pt-6"><ErrorBox message={error} onRetry={reload} /></div>;
  const { service, providers } = data;

  return (
    <div>
      <PageHeader title={service.name_ar} back="/" />
      <div className="mb-5 flex items-center gap-4 rounded-3xl bg-white p-5 shadow-card">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-50 text-accent">
          <ServiceIcon name={service.icon} className="h-7 w-7" />
        </span>
        <div className="flex-1">
          <p className="font-bold text-ink">{service.name_ar}</p>
          <p className="text-sm text-gray-500">{service.description_ar}</p>
        </div>
      </div>

      <LinkButton to={`/request/new?service=${service.slug}`} variant="accent" full>
        اطلب {service.name_ar} هسه
      </LinkButton>
      <p className="mt-2 text-center text-xs text-gray-500">اكتب مشكلتك وإحنا نطلعلك أنسب الفنيين القريبين</p>

      <h2 className="mb-3 mt-6 text-base font-bold text-ink">
        فنيين {service.name_ar} بـ{PROVINCE} ({providers.length})
      </h2>
      {providers.length ? (
        <div className="stagger space-y-3">
          {providers.map((p) => (
            <ProviderCard
              key={p.id}
              p={p}
              action={
                <LinkButton
                  to={`/request/new?service=${service.slug}&provider=${p.id}`}
                  className="!min-h-[40px] !rounded-xl !px-4 !text-sm"
                >
                  طلب فني
                </LinkButton>
              }
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="ماكو فنيين موثقين بهالخدمة بعد"
          text="أرسل طلبك وراح نبلغك أول ما يتوفر فني."
        />
      )}
    </div>
  );
}
