import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Card, LinkButton, PageHeader } from '../../components/ui';
import { ProviderForm } from './ProviderForm';
import { PortfolioManager, VerificationPanel } from './shared';

export default function ProfileEdit() {
  const { provider } = useAuth();
  const [saved, setSaved] = useState(false);
  if (!provider) return <Navigate to="/provider/onboarding" replace />;

  return (
    <div className="space-y-5">
      <PageHeader title="ملفي كفني" />
      <LinkButton to={`/providers/${provider.id}`} variant="outline" full>
        <ExternalLink className="h-4 w-4" /> شوف ملفك مثل ما يشوفه الزبون
      </LinkButton>

      <section>
        <h2 className="mb-3 font-bold text-ink">التوثيق</h2>
        <VerificationPanel />
      </section>

      <section>
        <h2 className="mb-3 font-bold text-ink">معرض الأعمال</h2>
        <PortfolioManager />
      </section>

      <section>
        <h2 className="mb-3 font-bold text-ink">معلوماتك</h2>
        <Card>
          <ProviderForm submitLabel="حفظ التعديلات" onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }} />
          {saved && <p className="mt-3 text-center text-sm font-semibold text-emerald-600">تم الحفظ ✓</p>}
        </Card>
      </section>
    </div>
  );
}
