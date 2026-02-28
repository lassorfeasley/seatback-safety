import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { SafetyCardWizard } from '@/components/Wizard';

export const AdminCropEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const panelParam = searchParams.get('panel');
  const sideParam = searchParams.get('side');
  const initialSlot =
    panelParam != null && (sideParam === 'front' || sideParam === 'back')
      ? { panelIndex: parseInt(panelParam, 10), side: sideParam as 'front' | 'back' }
      : undefined;

  if (!id) return null;

  return (
    <SafetyCardWizard
      editCardId={id}
      initialStep={3}
      initialSlot={initialSlot}
      onSaveComplete={() => navigate(`/admin/cards/${id}?editing=1#spreads`)}
      onBackToLibrary={(savingSlot) => {
        const params = new URLSearchParams({ editing: '1' });
        if (savingSlot) params.set('saving', `${savingSlot.panelIndex}-${savingSlot.side}`);
        navigate(`/admin/cards/${id}?${params}#spreads`);
      }}
    />
  );
};
