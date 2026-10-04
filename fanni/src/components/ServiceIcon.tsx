import {
  DoorClosed, Droplets, Hammer, PaintRoller, Snowflake, Sparkles, WashingMachine, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/utils';

const ICONS: Record<string, LucideIcon> = {
  droplets: Droplets,
  zap: Zap,
  snowflake: Snowflake,
  'washing-machine': WashingMachine,
  hammer: Hammer,
  'paint-roller': PaintRoller,
  'door-closed': DoorClosed,
  sparkles: Sparkles,
  wrench: Wrench,
};
export const ICON_NAMES = Object.keys(ICONS);

export function ServiceIcon({ name, className, strokeWidth }: { name: string; className?: string; strokeWidth?: number }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}

// One petal of the brand mark (src/assets/fanni-mark.svg), used as the frame of every service icon.
const PETAL = 'M382.51,315.6h174.32c44.44,0,77.2-41.97,65.92-84.95-27.67-105.48-100.24-189.99-192.87-226.03-44.35-17.25-92.12,16.05-92.12,63.64v202.59c0,24.72,20.04,44.75,44.75,44.75Z';

// Fixed color per service so it is the same everywhere; in the 3-column grid this makes a checkerboard.
const NAVY_SERVICES = new Set(['droplets', 'snowflake', 'hammer', 'door-closed']);

export type BadgeTone = 'navy' | 'orange';
export const toneForIcon = (icon: string): BadgeTone => (NAVY_SERVICES.has(icon) ? 'navy' : 'orange');

/** Service icon inside a brand petal. */
export function ServiceBadge({ icon, size = 56, tone, className }: {
  icon: string; size?: number; tone?: BadgeTone; className?: string;
}) {
  const t = tone ?? toneForIcon(icon);
  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="336 0 290 317" className="absolute inset-0 h-full w-full drop-shadow-sm">
        <path d={PETAL} fill={t === 'navy' ? '#203048' : '#FF7700'} />
      </svg>
      <span className="absolute flex items-center justify-center text-white"
        style={{ left: '14%', top: '24%', width: '62%', height: '62%' }}>
        <ServiceIcon name={icon} className="h-full w-full" strokeWidth={2.25} />
      </span>
    </span>
  );
}
