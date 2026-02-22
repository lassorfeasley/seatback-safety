import { useState, useCallback } from 'react';
import { SafetyCardWizard } from './components/Wizard';
import { LibraryPage, CardDetail, AirlinesPage, ManufacturersPage } from './components/Library';
import { AppShell, type Section } from './components/Layout/AppShell';
import { createBlankCard } from './lib/safetyCardService';

type Page =
  | { view: 'shell'; section: Section }
  | { view: 'wizard'; editCardId?: string; editStep?: 3 | 4 }
  | { view: 'detail'; cardId: string; isNew?: boolean; editing?: boolean };

function App() {
  const [page, setPage] = useState<Page>({ view: 'shell', section: 'cards' });

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
      : () => setPage({ view: 'shell', section: 'cards' });

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
        onBack={() => setPage({ view: 'shell', section: 'cards' })}
        onEditCrops={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 3 })}
        onEditFolds={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 4 })}
      />
    );
  }

  const activeSection = page.section;

  return (
    <AppShell
      activeSection={activeSection}
      onSectionChange={(section) => setPage({ view: 'shell', section })}
    >
      {activeSection === 'cards' && (
        <LibraryPage
          onNewCard={handleNewCard}
          onSelectCard={(cardId) => setPage({ view: 'detail', cardId })}
        />
      )}
      {activeSection === 'airlines' && (
        <AirlinesPage />
      )}
      {activeSection === 'manufacturers' && (
        <ManufacturersPage />
      )}
    </AppShell>
  );
}

export default App;
