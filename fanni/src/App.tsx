import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase';
import { AppShell, RequireAuth } from './components/Layout';
import Home from './pages/customer/Home';
import ServicePage from './pages/customer/ServicePage';
import ProviderProfile from './pages/customer/ProviderProfile';
import NewRequest from './pages/customer/NewRequest';
import MyRequests from './pages/customer/MyRequests';
import RequestDetail from './pages/RequestDetail';
import Account from './pages/Account';
import { Login, Register } from './pages/Auth';
import Onboarding from './pages/provider/Onboarding';
import ProviderDashboard from './pages/provider/Dashboard';
import ProfileEdit from './pages/provider/ProfileEdit';
import { Spinner } from './components/ui';

// Admin is only used by a few people: keep it out of the customer bundle.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Overview = lazy(() => import('./pages/admin/Overview'));
const Verifications = lazy(() => import('./pages/admin/Verifications'));
const AdminUsers = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminUsers })));
const AdminProviders = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminProviders })));
const AdminServices = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminServices })));
const AdminRequests = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminRequests })));
const AdminComplaints = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminComplaints })));
const AdminReviews = lazy(() => import('./pages/admin/Manage').then((m) => ({ default: m.AdminReviews })));

export default function App() {
  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold">فني<span className="text-accent">.</span></h1>
        <p className="mt-4 text-gray-600">
          التطبيق ما مربوط بـ Supabase بعد. سوّي ملف <code dir="ltr">.env</code> من <code dir="ltr">.env.example</code>
          وحط <code dir="ltr">VITE_SUPABASE_URL</code> و <code dir="ltr">VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<AppShell />}>
        {/* public */}
        <Route index element={<Home />} />
        <Route path="services/:slug" element={<ServicePage />} />
        <Route path="providers/:id" element={<ProviderProfile />} />

        {/* any signed-in user */}
        <Route path="request/new" element={<RequireAuth><NewRequest /></RequireAuth>} />
        <Route path="requests" element={<RequireAuth><MyRequests /></RequireAuth>} />
        <Route path="requests/:id" element={<RequireAuth><RequestDetail /></RequireAuth>} />
        <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />

        {/* provider */}
        <Route path="provider" element={<RequireAuth role="provider"><ProviderDashboard /></RequireAuth>} />
        <Route path="provider/onboarding" element={<RequireAuth role="provider"><Onboarding /></RequireAuth>} />
        <Route path="provider/profile" element={<RequireAuth role="provider"><ProfileEdit /></RequireAuth>} />

        {/* admin */}
        <Route path="admin" element={<RequireAuth role="admin"><Suspense fallback={<Spinner />}><AdminLayout /></Suspense></RequireAuth>}>
          <Route index element={<Overview />} />
          <Route path="verifications" element={<Verifications />} />
          <Route path="providers" element={<AdminProviders />} />
          <Route path="requests" element={<AdminRequests />} />
          <Route path="complaints" element={<AdminComplaints />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="services" element={<AdminServices />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
