import { Outlet } from 'react-router-dom';
import { AppShell } from '@/components/Layout/AppShell';

export const AdminLayout: React.FC = () => (
  <AppShell>
    <Outlet />
  </AppShell>
);
