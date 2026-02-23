import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AppShell, type Section } from '@/components/Layout/AppShell';

const SECTION_MAP: Record<string, Section> = {
  '/admin': 'cards',
  '/admin/airlines': 'airlines',
  '/admin/manufacturers': 'manufacturers',
};

export const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const activeSection: Section =
    SECTION_MAP[location.pathname] ?? 'cards';

  const handleSectionChange = (section: Section) => {
    switch (section) {
      case 'cards':
        navigate('/admin');
        break;
      case 'airlines':
        navigate('/admin/airlines');
        break;
      case 'manufacturers':
        navigate('/admin/manufacturers');
        break;
    }
  };

  return (
    <AppShell activeSection={activeSection} onSectionChange={handleSectionChange}>
      <Outlet />
    </AppShell>
  );
};
