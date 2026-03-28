import { useParams, useNavigate } from 'react-router-dom';
import { SafetyCardWizard } from '@/components/Wizard';

export const AdminFoldEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <SafetyCardWizard
      editCardId={id}
      initialStep={4}
      onSaveComplete={() => navigate(`/admin/cards/${id}?editing=1&from=folds`)}
      onBackToLibrary={() => navigate(`/admin/cards/${id}?editing=1`)}
    />
  );
};
