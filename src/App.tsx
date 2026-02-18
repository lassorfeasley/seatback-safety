import { useState } from 'react';
import { SafetyCardWizard } from './components/Wizard';
import { LibraryPage, CardDetail } from './components/Library';

type Page =
  | { view: 'library' }
  | { view: 'wizard' }
  | { view: 'detail'; cardId: string };

function App() {
  const [page, setPage] = useState<Page>({ view: 'library' });

  if (page.view === 'wizard') {
    return (
      <SafetyCardWizard
        onSaveComplete={(cardId: string) => setPage({ view: 'detail', cardId })}
        onBackToLibrary={() => setPage({ view: 'library' })}
      />
    );
  }

  if (page.view === 'detail') {
    return (
      <CardDetail
        cardId={page.cardId}
        onBack={() => setPage({ view: 'library' })}
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
