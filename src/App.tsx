import { useState, useCallback } from 'react';
import { SafetyCardWizard } from './components/Wizard';
import { LibraryPage, CardDetail } from './components/Library';
import { createBlankCard } from './lib/safetyCardService';

type Page =
  | { view: 'library' }
  | { view: 'wizard'; editCardId?: string; editStep?: 3 | 4 }
  | { view: 'detail'; cardId: string; isNew?: boolean; editing?: boolean };

function App() {
  const [page, setPage] = useState<Page>({ view: 'library' });

  const handleNewCard = useCallback(async () => {
    const result = await createBlankCard();
    if (result.cardId) {
      setPage({ view: 'detail', cardId: result.cardId, isNew: true });
    } else {
      alert(`Failed to create card: ${result.error}`);
    }
  }, []);

  if (page.view === 'wizard') {
    const returnTo = page.editCardId
      ? () => setPage({ view: 'detail', cardId: page.editCardId!, editing: true })
      : () => setPage({ view: 'library' });

    return (
      <SafetyCardWizard
        onSaveComplete={(cardId: string) => setPage({ view: 'detail', cardId, editing: true })}
        onBackToLibrary={returnTo}
        editCardId={page.editCardId}
        initialStep={page.editStep}
      />
    );
  }

  if (page.view === 'detail') {
    return (
      <CardDetail
        cardId={page.cardId}
        isNew={page.isNew}
        initialEditing={page.editing}
        onBack={() => setPage({ view: 'library' })}
        onEditCrops={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 3 })}
        onEditFolds={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 4 })}
      />
    );
  }

  return (
    <LibraryPage
      onNewCard={handleNewCard}
      onSelectCard={(cardId) => setPage({ view: 'detail', cardId })}
    />
  );
}

export default App;
