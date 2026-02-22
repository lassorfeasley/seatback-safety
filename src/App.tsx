import { useState } from 'react';
import { SafetyCardWizard } from './components/Wizard';
import { LibraryPage, CardDetail } from './components/Library';

type Page =
  | { view: 'library' }
  | { view: 'wizard'; editCardId?: string; editStep?: 3 | 4 }
  | { view: 'detail'; cardId: string };

function App() {
  const [page, setPage] = useState<Page>({ view: 'library' });

  if (page.view === 'wizard') {
    const returnTo = page.editCardId
      ? () => setPage({ view: 'detail', cardId: page.editCardId! })
      : () => setPage({ view: 'library' });

    return (
      <SafetyCardWizard
        onSaveComplete={(cardId: string) => setPage({ view: 'detail', cardId })}
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
        onBack={() => setPage({ view: 'library' })}
        onEditCrops={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 3 })}
        onEditFolds={() => setPage({ view: 'wizard', editCardId: page.cardId, editStep: 4 })}
      />
    );
  }

  return (
    <LibraryPage
      onNewCard={() => setPage({ view: 'wizard' })}
      onSelectCard={(cardId) => setPage({ view: 'detail', cardId })}
    />
  );
}

export default App;
