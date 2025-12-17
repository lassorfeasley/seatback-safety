import { useState } from 'react';
import { FoldEditor } from './components/FoldEditor';
import { PanelCropper } from './components/PanelCropper';
import type { Panel, Crease } from './components/FoldEditor';

// Continental DC9-10 Safety Card
// 3 spreads: Front Left/Middle/Right paired with Back panels
const examplePanels: Panel[] = [
  // Front panels (left to right)
  {
    id: 'panel-front-0',
    side: 'front',
    panel_index: 0,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925bf5b725852bc108bb8_Continental%20DC9-10_a.%20Front%20Left.png',
  },
  {
    id: 'panel-front-1',
    side: 'front',
    panel_index: 1,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925c35cd869c7a639c268_Continental%20DC9-10_b.%20Front%20Middle.png',
  },
  {
    id: 'panel-front-2',
    side: 'front',
    panel_index: 2,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925c63d844d9784828451_Continental%20DC9-10_c.%20Front%20Right.png',
  },
  // Back panels (left to right)
  {
    id: 'panel-back-0',
    side: 'back',
    panel_index: 0,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925d04784394852a57a19_Continental%20DC9-10_e.%20Back%20Midde.png',
  },
  {
    id: 'panel-back-1',
    side: 'back',
    panel_index: 1,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925d43d844dc5ca828532_Continental%20DC9-10_f.%20Back%20Right.png',
  },
  {
    id: 'panel-back-2',
    side: 'back',
    panel_index: 2,
    thumbnail_url: 'https://cdn.prod.website-files.com/5eb2d4bdce03ef0d9d35171d/609925d832a59530373deb64_Continental%20DC9-10_g.%20Back%20Right.png',
  },
];

// Example creases - note that front and back creases at the same position have opposite directions
// Crease between panels 0-1: front forward, back backward
// Crease between panels 1-2: front backward, back forward
// unfold_sequence: 0 = unfolds first, 1 = unfolds second (for accordion, inner folds unfold first)
const exampleCreases: Crease[] = [
  // Front side creases
  {
    id: 'crease-front-0',
    side: 'front',
    between_panel: 0,
    fold_direction: 'forward',
    unfold_sequence: 1, // Unfolds second (outer crease)
  },
  {
    id: 'crease-front-1',
    side: 'front',
    between_panel: 1,
    fold_direction: 'backward',
    unfold_sequence: 0, // Unfolds first (inner crease)
  },
  // Back side creases (opposite directions, same unfold sequence)
  {
    id: 'crease-back-0',
    side: 'back',
    between_panel: 0,
    fold_direction: 'backward',
    unfold_sequence: 1, // Same sequence as front crease 0
  },
  {
    id: 'crease-back-1',
    side: 'back',
    between_panel: 1,
    fold_direction: 'forward',
    unfold_sequence: 0, // Same sequence as front crease 1
  },
];

type TabType = 'cropper' | 'fold-editor';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('cropper');

  const handleSave = async (data: { panels: Panel[]; creases: Crease[] }) => {
    console.log('Saving data:', data);
    // Here you would call your Supabase mutation
    // Example:
    // await supabase.from('card_panels').upsert(data.panels);
    // await supabase.from('card_creases').upsert(data.creases);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Tab Navigation */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('cropper')}
              className={`
                py-4 px-2 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'cropper'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                }
              `}
            >
              Panel Cropper
            </button>
            <button
              onClick={() => setActiveTab('fold-editor')}
              className={`
                py-4 px-2 border-b-2 font-medium text-sm transition-colors
                ${activeTab === 'fold-editor'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                }
              `}
            >
              Fold Editor
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'cropper' && <PanelCropper />}

        {activeTab === 'fold-editor' && (
          <div className="p-8">
            <h1 className="text-3xl font-bold mb-2">Safety Card Fold Editor</h1>
            <p className="text-muted-foreground mb-6">Continental DC9-10</p>
            <FoldEditor
              cardId="example-card-1"
              initialPanels={examplePanels}
              initialCreases={exampleCreases}
              onSave={handleSave}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

