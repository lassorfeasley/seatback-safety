import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { CardDetail } from '@/components/Library';

export const AdminCardDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isNew = searchParams.get('new') === '1';
  const editing = searchParams.get('editing') === '1';

  if (!id) return null;

  return (
    <CardDetail
      cardId={id}
      isNew={isNew}
      initialEditing={isNew || editing}
      onBack={() => navigate('/admin')}
      onEditCrops={(panelIndex, side) => navigate(`/admin/cards/${id}/crop?panel=${panelIndex}&side=${side}`)}
      onEditFolds={() => navigate(`/admin/cards/${id}/folds`)}
      onPrintLabel={() => window.open(`/admin/cards/${id}/label`, '_blank')}
    />
  );
};
