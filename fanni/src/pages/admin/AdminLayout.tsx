import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';

const TABS = [
  ['/admin', 'نظرة عامة'],
  ['/admin/verifications', 'التوثيق'],
  ['/admin/providers', 'الفنيين'],
  ['/admin/requests', 'الطلبات'],
  ['/admin/complaints', 'الشكاوى'],
  ['/admin/reviews', 'التقييمات'],
  ['/admin/users', 'المستخدمين'],
  ['/admin/services', 'الخدمات'],
] as const;

export default function AdminLayout() {
  const { pathname } = useLocation();
  return (
    <div>
      <div className="sticky top-0 z-20 -mx-4 bg-surface/95 px-4 pb-2 pt-3 backdrop-blur">
        <h1 className="mb-2 text-lg font-bold text-ink">لوحة الإدارة</h1>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TABS.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold',
                  isActive ? 'bg-primary text-white' : 'bg-white text-gray-600 shadow-card')
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>
      <div key={pathname} className="animate-page-in pt-3">
        <Outlet />
      </div>
    </div>
  );
}
