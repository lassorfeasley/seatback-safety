import { useNavigate } from 'react-router-dom';
import { ManufacturersPage } from '@/components/Library';

export const AdminManufacturers: React.FC = () => {
  const navigate = useNavigate();
  return <ManufacturersPage onSelectManufacturer={(id) => navigate(`/admin/manufacturers/${id}`)} />;
};
