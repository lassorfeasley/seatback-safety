import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { fetchManufacturersBrowse, type ManufacturerBrowse } from '@/lib/lookupService';
import { useBreadcrumbs } from './BreadcrumbContext';

const ACCENT = 'oklch(50% 0.134 242.749)';

type SortKey = 'name-asc' | 'name-desc' | 'cards-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'A → Z' },
  { value: 'name-desc', label: 'Z → A' },
  { value: 'cards-desc', label: 'Most cards' },
];

function sortManufacturers(list: ManufacturerBrowse[], key: SortKey): ManufacturerBrowse[] {
  const sorted = [...list];
  switch (key) {
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'cards-desc':
      return sorted.sort((a, b) => b.card_count - a.card_count || a.name.localeCompare(b.name));
  }
}

export const PublicManufacturersBrowse: React.FC = () => {
  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name-asc');
  const { setToolbar } = useBreadcrumbs();

  useEffect(() => {
    fetchManufacturersBrowse().then((data) => {
      setManufacturers(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    let list = manufacturers;
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((m) => {
        const haystack = [m.name, m.country]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
    }
    return sortManufacturers(list, sort);
  }, [manufacturers, query, sort]);

  const handleClearQuery = useCallback(() => {
    setQuery('');
  }, []);

  useEffect(() => {
    setToolbar(
      <HeaderToolbar
        query={query}
        onQueryChange={setQuery}
        onClearQuery={handleClearQuery}
        sort={sort}
        onSortChange={setSort}
      />
    );
    return () => setToolbar(null);
  }, [query, sort, setToolbar, handleClearQuery]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No manufacturers match your search.</p>
          <button
            onClick={() => setQuery('')}
            className="text-sm text-primary hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : sort === 'name-asc' ? (
        <AlphaGroupedGrid manufacturers={filtered} />
      ) : (
        <FlatGrid manufacturers={filtered} />
      )}
    </div>
  );
};

const HeaderToolbar: React.FC<{
  query: string;
  onQueryChange: (v: string) => void;
  onClearQuery: () => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
}> = ({
  query, onQueryChange, onClearQuery,
  sort, onSortChange,
}) => (
  <div className="flex items-stretch gap-0 w-full normal-case tracking-normal">
    <div className="relative flex-1 max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: ACCENT }} />
      <input
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search manufacturers..."
        className="w-full h-full bg-[#ebeaef] pl-9 pr-8 text-xs placeholder:opacity-60
                   focus:outline-none transition-colors"
        style={{ color: ACCENT }}
      />
      {query && (
        <button
          onClick={onClearQuery}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 hover:opacity-70"
          style={{ color: ACCENT }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>

    <select
      value={sort}
      onChange={(e) => onSortChange(e.target.value as SortKey)}
      className="ml-auto bg-[#ebeaef] text-xs pl-3 pr-5
                 focus:outline-none transition-colors"
      style={{ color: ACCENT }}
    >
      {SORT_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const AlphaGroupedGrid: React.FC<{ manufacturers: ManufacturerBrowse[] }> = ({ manufacturers }) => {
  const groups = useMemo(() => {
    const map = new Map<string, ManufacturerBrowse[]>();
    manufacturers.forEach((m) => {
      const letter = m.name.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(m);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [manufacturers]);

  return (
    <div className="space-y-10">
      {groups.map(([letter, items]) => (
        <div key={letter} id={`letter-${letter}`} className="scroll-mt-28">
          <h2 className="text-lg font-semibold text-muted-foreground mb-4">{letter}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
            {items.map((mfr) => (
              <ManufacturerTile key={mfr.id} mfr={mfr} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const FlatGrid: React.FC<{ manufacturers: ManufacturerBrowse[] }> = ({ manufacturers }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
    {manufacturers.map((mfr) => (
      <ManufacturerTile key={mfr.id} mfr={mfr} />
    ))}
  </div>
);

const ManufacturerTile: React.FC<{ mfr: ManufacturerBrowse }> = ({ mfr }) => (
  <Link
    to={`/manufacturers/${mfr.id}`}
    className="group flex flex-col overflow-hidden
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    <div className="aspect-square bg-[#ebeaef] relative overflow-hidden flex items-center justify-center">
      {mfr.logo_url ? (
        <img src={mfr.logo_url} alt={mfr.name}
             className="w-3/4 h-3/4 object-contain" />
      ) : (
        <span className="text-4xl font-bold text-muted-foreground">
          {mfr.name.charAt(0)}
        </span>
      )}
    </div>
    <div className="pt-2 px-0.5">
      <p className="text-sm font-medium truncate">{mfr.name}</p>
    </div>
  </Link>
);
