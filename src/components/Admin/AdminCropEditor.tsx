import { useParams, useNavigate } from 'react-router-dom';
import { SafetyCardWizard } from '@/components/Wizard';

export const AdminCropEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <SafetyCardWizard
      editCardId={id}
      initialStep={3}
      onSaveComplete={() => navigate(`/admin/cards/${id}?editing=1`)}
      onBackToLibrary={() => navigate(`/admin/cards/${id}?editing=1`)}
    />
  );
};
