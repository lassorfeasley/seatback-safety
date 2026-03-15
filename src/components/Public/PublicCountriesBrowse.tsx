import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { fetchCountriesBrowse, type CountryBrowse } from '@/lib/lookupService';
import { countryToFlag } from '@/lib/countryFlags';
import { useBreadcrumbs } from './BreadcrumbContext';

type SortKey = 'name-asc' | 'name-desc' | 'cards-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name-asc', label: 'A → Z' },
  { value: 'name-desc', label: 'Z → A' },
  { value: 'cards-desc', label: 'Most cards' },
];

function sortCountries(list: CountryBrowse[], key: SortKey): CountryBrowse[] {
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

export const PublicCountriesBrowse: React.FC = () => {
  const [countries, setCountries] = useState<CountryBrowse[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('name-asc');
  const { setBreadcrumbs, clearBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    fetchCountriesBrowse().then((data) => {
      setCountries(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setBreadcrumbs([{ label: 'Countries' }]);
    return () => clearBreadcrumbs();
  }, [setBreadcrumbs, clearBreadcrumbs]);

  const filtered = useMemo(() => {
    let list = countries;
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return sortCountries(list, sort);
  }, [countries, query, sort]);

  const handleClearQuery = useCallback(() => setQuery(''), []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-8">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search countries..."
            className="w-full h-9 rounded-md border border-input bg-transparent pl-9 pr-8 text-sm
                       placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {query && (
            <button
              type="button"
              onClick={handleClearQuery}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm
                     focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading countries...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No countries match your search.</p>
          <button
            onClick={() => setQuery('')}
            className="text-sm text-primary hover:underline mt-2"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {filtered.map((country) => (
            <Link
              key={country.name}
              to={`/airlines?q=${encodeURIComponent(country.name)}`}
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-[#ebeaef] relative overflow-hidden flex items-center justify-center">
                <span className="text-6xl md:text-7xl" role="img" aria-label={country.name}>
                  {countryToFlag(country.name)}
                </span>
              </div>
              <div className="pt-2 px-0.5">
                <p className="text-sm font-medium truncate">{country.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {country.card_count} card{country.card_count !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
