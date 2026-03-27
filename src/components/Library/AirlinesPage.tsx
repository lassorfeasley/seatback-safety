import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, Pencil, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  fetchAirlinesBrowse,
  createAirline,
  updateAirline,
  uploadEntityImage,
  deleteEntityImage,
  type AirlineBrowse,
  type AirlineUpdate,
} from '@/lib/lookupService';
import { CountrySelect } from '@/components/ui/country-select';

interface AirlinesPageProps {
  onSelectAirline?: (id: string) => void;
}

export const AirlinesPage: React.FC<AirlinesPageProps> = ({ onSelectAirline }) => {
  const [airlines, setAirlines] = useState<AirlineBrowse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchAirlinesBrowse();
    setAirlines(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <header className="flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 pt-8 pb-4">
          <h1 className="text-sm font-medium tracking-widest uppercase text-black/60">Airlines</h1>
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            variant="outline"
            className="gap-1.5 border-black/20 text-black/60 hover:text-black hover:bg-gray-50"
            disabled={showCreate}
          >
            <Plus className="h-4 w-4" />
            Add Airline
          </Button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {showCreate && (
            <AirlineCreateCard
              onCreated={() => { setShowCreate(false); refresh(); }}
              onCancel={() => setShowCreate(false)}
            />
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading airlines...</p>
            </div>
          ) : airlines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <h2 className="text-lg font-medium">No airlines yet</h2>
              <p className="text-sm text-muted-foreground">Add your first airline to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {airlines.map((airline) => (
                <AirlineTile
                  key={airline.id}
                  airline={airline}
                  isEditing={editingId === airline.id}
                  onEdit={() => setEditingId(airline.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSaved={() => { setEditingId(null); refresh(); }}
                  onClick={() => onSelectAirline?.(airline.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

// ─── Create Card ──────────────────────────────────────────────────

const AirlineCreateCard: React.FC<{
  onCreated: () => void;
  onCancel: () => void;
}> = ({ onCreated, onCancel }) => {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createAirline(name.trim());
      onCreated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    }
    setSaving(false);
  };

  return (
    <div className="mb-6 p-4 rounded-lg border bg-card flex items-center gap-3">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        placeholder="Airline name..."
        className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm
                   placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Button size="sm" onClick={handleCreate} disabled={!name.trim() || saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

// ─── Airline Tile ─────────────────────────────────────────────────

const AirlineTile: React.FC<{
  airline: AirlineBrowse;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onClick: () => void;
}> = ({ airline, isEditing, onEdit, onCancelEdit, onSaved, onClick }) => {
  if (isEditing) {
    return <AirlineEditForm airline={airline} onSaved={onSaved} onCancel={onCancelEdit} />;
  }

  return (
    <div
      className="group relative flex items-center gap-4 pr-4 rounded-lg border bg-card overflow-hidden
                 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <LogoCircle url={airline.logo_url} name={airline.name} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{airline.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {airline.iata_code && (
            <span className="text-xs text-muted-foreground font-mono">{airline.iata_code}</span>
          )}
          {airline.country && (
            <span className="text-xs text-muted-foreground">{airline.country}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {airline.card_count} card{airline.card_count !== 1 ? 's' : ''}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                   p-1.5 rounded-md hover:bg-accent"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
};

// ─── Inline Edit Form ────────────────────────────────────────────

const INPUT_CLASS =
  'h-8 rounded-md border border-input bg-transparent px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const AirlineEditForm: React.FC<{
  airline: AirlineBrowse;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ airline, onSaved, onCancel }) => {
  const [name, setName] = useState(airline.name);
  const [iata, setIata] = useState(airline.iata_code ?? '');
  const [icao, setIcao] = useState(airline.icao_code ?? '');
  const [country, setCountry] = useState(airline.country ?? '');
  const [description, setDescription] = useState(airline.description ?? '');
  const [logoPath, setLogoPath] = useState(airline.logo_path);
  const [logoPreview, setLogoPreview] = useState(airline.logo_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { path, url } = await uploadEntityImage('airlines', airline.id, file);
      setLogoPath(path);
      setLogoPreview(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
    setUploading(false);
  };

  const handleRemoveLogo = async () => {
    if (logoPath) {
      await deleteEntityImage(logoPath);
      setLogoPath(null);
      setLogoPreview(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const update: AirlineUpdate = {
        name: name.trim() || undefined,
        iata_code: iata.trim().toUpperCase() || null,
        icao_code: icao.trim().toUpperCase() || null,
        country: country.trim() || null,
        description: description.trim() || null,
        logo_path: logoPath,
      };
      await updateAirline(airline.id, update);
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="p-4 rounded-lg border-2 border-primary/30 bg-card flex flex-col gap-3">
      <div className="flex items-start gap-4">
        <div className="relative group/logo">
          <LogoCircle url={logoPreview} name={name} />
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 bg-black/0 group-hover/logo:bg-black/40
                       flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : (
              <Upload className="h-4 w-4 text-white" />
            )}
          </button>
          {logoPath && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white
                         flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <input className={cn(INPUT_CLASS, 'col-span-2')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
          <input className={INPUT_CLASS} value={iata} onChange={(e) => setIata(e.target.value)} placeholder="IATA (e.g. AA)" maxLength={3} />
          <input className={INPUT_CLASS} value={icao} onChange={(e) => setIcao(e.target.value)} placeholder="ICAO (e.g. AAL)" maxLength={4} />
          <div className="col-span-2">
            <CountrySelect value={country} onChange={setCountry} placeholder="Country" />
          </div>
        </div>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="rounded-md border border-input bg-transparent px-2.5 py-2 text-sm placeholder:text-muted-foreground
                   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
};

// ─── Shared ─────────────────────────────────────────────────────

const LogoCircle: React.FC<{ url: string | null; name: string }> = ({ url, name }) => (
  <div className="h-20 w-20 bg-[#ebeaef] flex-shrink-0 flex items-center justify-center overflow-hidden">
    {url ? (
      <img src={url} alt={name} className="w-3/4 h-3/4 object-contain" />
    ) : (
      <span className="text-lg font-bold text-muted-foreground">
        {name.charAt(0).toUpperCase()}
      </span>
    )}
  </div>
);
