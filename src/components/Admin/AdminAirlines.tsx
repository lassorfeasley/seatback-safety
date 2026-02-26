import { useNavigate } from 'react-router-dom';
import { AirlinesPage } from '@/components/Library';

export const AdminAirlines: React.FC = () => {
  const navigate = useNavigate();
  return <AirlinesPage onSelectAirline={(id) => navigate(`/admin/airlines/${id}`)} />;
};
