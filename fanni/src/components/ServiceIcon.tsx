import {
  DoorClosed, Droplets, Hammer, PaintRoller, Snowflake, Sparkles, WashingMachine, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

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

export function ServiceIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon className={className} />;
}
