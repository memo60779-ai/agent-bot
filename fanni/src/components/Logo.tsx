import markUrl from '../assets/fanni-mark.svg';
import { cn } from '../lib/utils';

/**
 * Brand mark (designer's file: src/assets/fanni-mark.svg — white/orange petals, made for
 * dark backgrounds). `flat` = draw it directly on an existing navy surface; otherwise it
 * sits on its own navy tile so it works on light backgrounds too.
 */
export function LogoMark({ size = 40, className, flat }: { size?: number; className?: string; flat?: boolean }) {
  if (flat) {
    return <img src={markUrl} width={size} height={size} alt="" aria-hidden="true" className={className} />;
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center bg-primary', className)}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
      aria-hidden="true"
    >
      <img src={markUrl} alt="" style={{ width: size * 0.8, height: size * 0.8 }} />
    </span>
  );
}

/** Mark + Arabic wordmark. `light` = on a dark (navy) background. */
export function Logo({ size = 36, light, className }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label="فني">
      <LogoMark size={size} flat={light} />
      <span
        className={cn('font-extrabold leading-none tracking-tight', light ? 'text-white' : 'text-primary')}
        style={{ fontSize: size * 0.82 }}
      >
        فني
      </span>
    </span>
  );
}
