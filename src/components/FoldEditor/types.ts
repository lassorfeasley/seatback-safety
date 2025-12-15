export type Side = 'front' | 'back';
export type FoldDirection = 'forward' | 'backward';

export interface Panel {
  id: string;
  side: Side;
  panel_index: number;
  thumbnail_url: string;
}

export interface Crease {
  id?: string;
  side: Side; // which side this crease belongs to
  between_panel: number; // panel_index where crease exists (between N and N+1)
  fold_direction: FoldDirection;
  unfold_sequence: number; // order in which this crease unfolds (0 = first, 1 = second, etc.)
}

export interface FoldEditorData {
  panels: Panel[];
  creases: Crease[];
}

export interface FoldEditorProps {
  cardId: string;
  initialPanels: Panel[];
  initialCreases: Crease[];
  onSave?: (data: FoldEditorData) => void | Promise<void>;
}

