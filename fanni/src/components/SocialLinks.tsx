import { cn } from '../lib/utils';

// Faniy's own pages (not providers'). Kept low-key in the UI: the goal of the
// app is a request, following us is secondary.
export const SOCIAL = [
  {
    name: 'Instagram',
    label: 'إنستغرام',
    url: 'https://www.instagram.com/faniy.iq/',
    color: '#E4405F',
    path: 'M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1.1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1.1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1 .1-1.6.2-2 .4-.5.2-.8.4-1.2.8-.4.4-.6.7-.8 1.2-.1.4-.3.9-.4 2-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1 .2 1.6.4 2 .2.5.4.8.8 1.2.4.4.7.6 1.2.8.4.1.9.3 2 .4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1-.1 1.6-.2 2-.4.5-.2.8-.4 1.2-.8.4-.4.6-.7.8-1.2.1-.4.3-.9.4-2 .1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1-.2-1.6-.4-2-.2-.5-.4-.8-.8-1.2-.4-.4-.7-.6-1.2-.8-.4-.1-.9-.3-2-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zm0 8.1a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zm6.2-8.3a1.1 1.1 0 1 1-2.3 0 1.1 1.1 0 0 1 2.3 0z',
  },
  {
    name: 'Facebook',
    label: 'فيسبوك',
    url: 'https://www.facebook.com/profile.php?id=61595095501501',
    color: '#1877F2',
    path: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z',
  },
] as const;

function Logo({ path, className }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

/** Account page: a small "follow us" card. */
export function FollowUsCard() {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-card">
      <p className="mb-3 text-sm font-bold text-ink">تابع «فني»</p>
      <div className="grid grid-cols-2 gap-2">
        {SOCIAL.map((s) => (
          <a
            key={s.name}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="pressable flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-bold text-ink"
          >
            <span style={{ color: s.color }}><Logo path={s.path} className="h-5 w-5" /></span>
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Footers: icon-only links. */
export function SocialIcons({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {SOCIAL.map((s) => (
        <a key={s.name} href={s.url} target="_blank" rel="noreferrer" aria-label={`«فني» على ${s.label}`}
          className="text-gray-400 transition-colors hover:text-primary">
          <Logo path={s.path} className="h-5 w-5" />
        </a>
      ))}
    </span>
  );
}
