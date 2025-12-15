import { FoldEditor } from './components/FoldEditor';
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
const exampleCreases: Crease[] = [
  // Front side creases
  {
    id: 'crease-front-0',
    side: 'front',
    between_panel: 0,
    fold_direction: 'forward', // front crease 0
  },
  {
    id: 'crease-front-1',
    side: 'front',
    between_panel: 1,
    fold_direction: 'backward', // front crease 1
  },
  // Back side creases (opposite directions)
  {
    id: 'crease-back-0',
    side: 'back',
    between_panel: 0,
    fold_direction: 'backward', // back crease 0 (opposite of front)
  },
  {
    id: 'crease-back-1',
    side: 'back',
    between_panel: 1,
    fold_direction: 'forward', // back crease 1 (opposite of front)
  },
];

function App() {
  const handleSave = async (data: { panels: Panel[]; creases: Crease[] }) => {
    console.log('Saving data:', data);
    // Here you would call your Supabase mutation
    // Example:
    // await supabase.from('card_panels').upsert(data.panels);
    // await supabase.from('card_creases').upsert(data.creases);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Safety Card Fold Editor</h1>
        <p className="text-muted-foreground mb-6">Continental DC9-10</p>
        <FoldEditor
          cardId="example-card-1"
          initialPanels={examplePanels}
          initialCreases={exampleCreases}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}

export default App;

