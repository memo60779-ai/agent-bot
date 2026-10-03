import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ClipboardList, Home, LayoutDashboard, UserRound, Inbox, IdCard, Shield } from 'lucide-react';
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
        cn('flex flex-1 flex-col items-center gap-1 py-2 text-xs font-semibold', isActive ? 'text-primary' : 'text-gray-400')
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function AppShell() {
  const { profile } = useAuth();
  const { pathname } = useLocation();
  const role = profile?.role;
  const ic = 'h-6 w-6';
  const wide = pathname.startsWith('/admin');

  return (
    <div className={cn('mx-auto min-h-screen bg-surface', wide ? 'max-w-5xl' : 'max-w-xl')}>
      <main className="px-4 pb-28 pt-1">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-xl">
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
              {role === 'admin' && <Tab to="/admin" icon={<LayoutDashboard className={ic} />} label="الإدارة" />}
              <Tab to="/account" icon={<UserRound className={ic} />} label="حسابي" />
            </>
          )}
        </div>
      </nav>
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
