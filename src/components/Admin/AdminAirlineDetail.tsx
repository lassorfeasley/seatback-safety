import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Pencil, Upload, X, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  fetchAirlineDetail,
  updateAirline,
  uploadEntityImage,
  deleteEntityImage,
  type AirlineDetail,
  type AirlineUpdate,
} from '@/lib/lookupService';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { CountrySelect } from '@/components/ui/country-select';

const INPUT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export const AdminAirlineDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [airline, setAirline] = useState<AirlineDetail | null>(null);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [a, allCards] = await Promise.all([fetchAirlineDetail(id), fetchCards()]);
    setAirline(a);
    setCards(allCards.filter((c) => c.airline_name === a?.name));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!airline) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <p className="text-muted-foreground">Airline not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/airlines')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Airlines
        </Button>
      </div>
    );
  }

  return (
    <>
      <header className="flex-shrink-0 bg-card border-b">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <button
            onClick={() => navigate('/admin/airlines')}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" /> Airlines
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {editing ? (
            <AirlineProfileEditor
              airline={airline}
              onSaved={() => { setEditing(false); load(); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <AirlineProfileCard airline={airline} onEdit={() => setEditing(true)} />
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight mb-4">
              Safety Cards
              <span className="text-muted-foreground font-normal ml-2 text-sm">
                {cards.length}
              </span>
            </h2>
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No safety cards linked to this airline yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {cards.map((card) => (
                  <AdminCardTile
                    key={card.id}
                    card={card}
                    onClick={() => navigate(`/admin/cards/${card.id}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

// ─── Profile Display ──────────────────────────────────────────────

const AirlineProfileCard: React.FC<{
  airline: AirlineDetail;
  onEdit: () => void;
}> = ({ airline, onEdit }) => (
  <div className="relative rounded-xl border bg-card p-6">
    <button
      onClick={onEdit}
      className="absolute top-4 right-4 p-2 rounded-md hover:bg-accent transition-colors"
    >
      <Pencil className="h-4 w-4 text-muted-foreground" />
    </button>

    <div className="flex items-start gap-5">
      <div className="h-20 w-20 rounded-xl bg-muted/60 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {airline.logo_url ? (
          <img src={airline.logo_url} alt={airline.name} className="h-full w-full object-contain" />
        ) : (
          <span className="text-2xl font-bold text-muted-foreground">
            {airline.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{airline.name}</h1>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
          {airline.iata_code && (
            <span className="text-sm text-muted-foreground">
              IATA: <span className="font-mono font-medium text-foreground">{airline.iata_code}</span>
            </span>
          )}
          {airline.icao_code && (
            <span className="text-sm text-muted-foreground">
              ICAO: <span className="font-mono font-medium text-foreground">{airline.icao_code}</span>
            </span>
          )}
          {airline.country && (
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> {airline.country}
            </span>
          )}
        </div>

        {airline.description && (
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-2xl">
            {airline.description}
          </p>
        )}

        <div className="mt-3">
          <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
            airline.active
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/10 text-amber-600'
          )}>
            {airline.active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    </div>
  </div>
);

// ─── Profile Editor ───────────────────────────────────────────────

const AirlineProfileEditor: React.FC<{
  airline: AirlineDetail;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ airline, onSaved, onCancel }) => {
  const [name, setName] = useState(airline.name);
  const [iata, setIata] = useState(airline.iata_code ?? '');
  const [icao, setIcao] = useState(airline.icao_code ?? '');
  const [country, setCountry] = useState(airline.country ?? '');
  const [description, setDescription] = useState(airline.description ?? '');
  const [active, setActive] = useState(airline.active);
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
        active,
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
    <div className="rounded-xl border-2 border-primary/30 bg-card p-6">
      <div className="flex items-start gap-5">
        <div className="relative group/logo">
          <div className="h-20 w-20 rounded-xl bg-muted/60 flex-shrink-0 flex items-center justify-center overflow-hidden">
            {logoPreview ? (
              <img src={logoPreview} alt={name} className="h-full w-full object-contain" />
            ) : (
              <span className="text-2xl font-bold text-muted-foreground">
                {(name || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 rounded-xl bg-black/0 group-hover/logo:bg-black/40
                       flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-all"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Upload className="h-5 w-5 text-white" />
            )}
          </button>
          {logoPath && (
            <button
              onClick={(e) => { e.stopPropagation(); handleRemoveLogo(); }}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white
                         flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex-1 grid grid-cols-2 gap-3">
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
        rows={3}
        className="mt-4 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground
                   focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
      />

      <div className="flex items-center justify-between mt-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-input"
          />
          Active airline
        </label>

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Card Tile ────────────────────────────────────────────────────

const AdminCardTile: React.FC<{ card: CardSummary; onClick: () => void }> = ({ card, onClick }) => {
  const fallbacks = [card.og_url, card.thumbnail_url].filter(Boolean) as string[];
  const [imgSrc, setImgSrc] = useState<string | null>(fallbacks[0] ?? null);
  const fallbackIdx = useRef(0);

  return (
    <button
      onClick={onClick}
      className="group flex flex-col rounded-lg overflow-hidden
                 transition-all hover:shadow-lg focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary text-left"
    >
      <div className="aspect-square bg-muted/60 relative overflow-hidden rounded-lg">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={card.title || 'Safety card'}
            className="absolute inset-0 w-full h-full object-cover
                       transition-transform group-hover:scale-[1.03]"
            onError={() => {
              fallbackIdx.current += 1;
              if (fallbackIdx.current < fallbacks.length) {
                setImgSrc(fallbacks[fallbackIdx.current]);
              } else {
                setImgSrc(null);
              }
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
            No image
          </div>
        )}
      </div>
      <div className="pt-2 px-0.5">
        <p className="text-sm font-medium truncate">
          {card.title || card.airline_name || 'Untitled Card'}
        </p>
        {card.aircraft_label && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{card.aircraft_label}</p>
        )}
      </div>
    </button>
  );
};
