import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ClipboardList, Home, LayoutDashboard, UserRound, Inbox, IdCard, Plus, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import type { UserRole } from '../lib/types';
import { cn } from '../lib/utils';
import { Spinner } from './ui';

function Tab({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn('pressable relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-bold transition-colors',
          isActive ? 'text-primary' : 'text-gray-400')
      }
    >
      {({ isActive }) => (
        <>
          <span className={cn('absolute top-0 h-1 rounded-b-full bg-accent transition-all duration-300',
            isActive ? 'w-8 opacity-100' : 'w-0 opacity-0')} />
          <span className={cn('transition-transform duration-300', isActive && '-translate-y-0.5 scale-110')}>{icon}</span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Big raised center action: start a new request. */
function RequestFab() {
  const { pathname } = useLocation();
  const active = pathname.startsWith('/request/new');
  return (
    <div className="relative flex flex-1 justify-center">
      <Link
        to="/request/new"
        aria-label="اطلب خدمة"
        className={cn(
          'pressable absolute -top-8 flex h-14 w-14 flex-col items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/40 ring-4 ring-white',
          !active && 'animate-pulse-ring',
        )}
      >
        <Plus className={cn('h-7 w-7 transition-transform duration-300', active && 'rotate-45')} strokeWidth={2.6} />
      </Link>
      <span className="mt-auto pb-2 text-[11px] font-bold text-accent">اطلب</span>
    </div>
  );
}

export function AppShell() {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const role = profile?.role;
  const ic = 'h-6 w-6';
  const wide = pathname.startsWith('/admin');
  // admin sub-pages animate inside AdminLayout; animate the shell only between top-level sections
  const transitionKey = wide ? '/admin' : pathname;
  // focused flow: the request wizard has its own footer, so hide the tab bar
  const hideNav = pathname.startsWith('/request/new');

  return (
    <div className={cn('mx-auto min-h-screen bg-surface', wide ? 'max-w-5xl' : 'max-w-xl')}>
      <main key={transitionKey} className="animate-page-in px-4 pb-32 pt-1">
        <Outlet />
      </main>
      {!hideNav && <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(32,48,72,.06)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl items-stretch">
          {role === 'provider' ? (
            <>
              <Tab to="/provider" end icon={<Inbox className={ic} />} label="الطلبات" />
              <Tab to="/provider/profile" icon={<IdCard className={ic} />} label="ملفي" />
              <Tab to="/account" icon={<UserRound className={ic} />} label="حسابي" />
            </>
          ) : (
            <>
              <Tab to="/" end icon={<Home className={ic} />} label="الرئيسية" />
              <Tab to="/requests" icon={<ClipboardList className={ic} />} label="طلباتي" />
              <RequestFab />
              {role === 'admin' && <Tab to="/admin" icon={<LayoutDashboard className={ic} />} label="الإدارة" />}
              <Tab to="/account" icon={<UserRound className={ic} />} label="حسابي" />
            </>
          )}
        </div>
      </nav>}
    </div>
  );
}

/** Route guard: requires login, optionally a specific role. */
export function RequireAuth({ role, children }: { role?: UserRole; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();
  if (loading || (session && !profile)) return <Spinner className="pt-32" />;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (profile && !profile.is_active) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Shield className="mx-auto mb-3 h-12 w-12 text-red-400" />
        <p className="font-bold">حسابك موقوف</p>
        <p className="mt-1 text-sm text-gray-500">تواصل ويا إدارة فني للمساعدة.</p>
      </div>
    );
  }
  if (role && profile?.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
