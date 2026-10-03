import { cn } from '../lib/utils';

// Mark: a roof (home services) over a wrench (the craft). Orange roof = brand accent.
const WRENCH = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z';

export function LogoMark({ size = 40, className, flat }: { size?: number; className?: string; flat?: boolean }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-hidden="true">
      {!flat && <rect width="512" height="512" rx="120" fill="#203048" />}
      <path d="M104 246 L256 114 L408 246" fill="none" stroke="#FF7700" strokeWidth="38"
        strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(150 214) scale(9.2)">
        <path d={WRENCH} fill="#fff" stroke="#fff" strokeWidth="1.2" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Mark + Arabic wordmark. `light` = for dark backgrounds. */
export function Logo({ size = 36, light, className }: { size?: number; light?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)} aria-label="فني">
      <LogoMark size={size} />
      <span
        className={cn('font-extrabold leading-none tracking-tight', light ? 'text-white' : 'text-primary')}
        style={{ fontSize: size * 0.82 }}
      >
        فني
      </span>
    </span>
  );
}
