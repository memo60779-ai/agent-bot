import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/utils';
import { Button, PageHeader } from '../../components/ui';
import { ProviderForm } from './ProviderForm';
import { PortfolioManager, VerificationPanel } from './shared';

const STEPS = ['معلوماتك', 'صور أعمالك', 'التوثيق'];

export default function Onboarding() {
  const { provider } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(provider ? 1 : 0);

  // Already onboarded & applied: nothing to do here.
  if (provider && ['pending', 'verified'].includes(provider.verification_status) && step !== 2) {
    return <Navigate to="/provider" replace />;
  }

  return (
    <div>
      <PageHeader title="سجّل كفني" />
      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1 text-center">
            <div className={cn('mb-1 h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-gray-200')} />
            <span className={cn('text-xs font-semibold', i === step ? 'text-accent' : 'text-gray-400')}>{s}</span>
          </div>
        ))}
      </div>

      {step === 0 && <ProviderForm submitLabel="التالي" onSaved={() => setStep(1)} />}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">صور من شغلك</h2>
            <p className="text-sm text-gray-500">الزبائن يحبون يشوفون شغلك قبل ما يطلبوك. ضيف 3 صور على الأقل.</p>
          </div>
          <PortfolioManager />
          <Button full onClick={() => setStep(2)}>التالي</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <VerificationPanel onSubmitted={() => nav('/provider', { replace: true })} />
          <Button variant="ghost" full size="md" onClick={() => nav('/provider', { replace: true })}>
            أكمل بعدين
          </Button>
        </div>
      )}
    </div>
  );
}
