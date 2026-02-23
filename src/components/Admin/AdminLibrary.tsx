import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';
import { LibraryPage } from '@/components/Library';
import { createBlankCard } from '@/lib/safetyCardService';

export const AdminLibrary: React.FC = () => {
  const navigate = useNavigate();

  const handleNewCard = useCallback(async () => {
    const result = await createBlankCard();
    if (result.cardId) {
      navigate(`/admin/cards/${result.cardId}?new=1`);
    } else {
      alert(`Failed to create card: ${result.error}`);
    }
  }, [navigate]);

  return (
    <LibraryPage
      onNewCard={handleNewCard}
      onSelectCard={(cardId) => navigate(`/admin/cards/${cardId}`)}
    />
  );
};
