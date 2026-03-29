import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { fetchCards, type CardSummary } from '@/lib/safetyCardService';
import { fetchCountriesBrowse, type CountryBrowse } from '@/lib/lookupService';
import { countryToFlag } from '@/lib/countryFlags';
import { PublicCardTile } from './PublicCardTile';

export const PublicSearch: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const [input, setInput] = useState(query);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [countries, setCountries] = useState<CountryBrowse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchCards(), fetchCountriesBrowse()]).then(([cardData, countryData]) => {
      setCards(cardData);
      setCountries(countryData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    setInput(query);
  }, [query]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const expandedTerms = terms.flatMap((term) => {
      const prefixMap: Record<string, string> = {
        'a': 'airbus', 'b': 'boeing', 'e': 'embraer',
        'crj': 'bombardier', 'erj': 'embraer', 'atr': 'atr',
        'dhc': 'de havilland', 'md': 'mcdonnell douglas',
        'dc': 'mcdonnell douglas', 'tu': 'tupolev', 'il': 'ilyushin',
        'an': 'antonov', 'do': 'dornier', 'bae': 'british aerospace',
        'f': 'fokker', 'l': 'lockheed',
      };
      const match = term.match(/^([a-z]+)[-]?(\d.*)$/);
      if (match) {
        const [, prefix, number] = match;
        const mfr = prefixMap[prefix];
        if (mfr) return [term, mfr, number];
      }
      return [term];
    });

    return cards.filter((c) => {
      const haystack = [
        c.title,
        c.airline_name,
        c.aircraft_label,
        c.published_year != null ? String(c.published_year) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => {
        if (haystack.includes(term)) return true;
        const extras = expandedTerms.filter((e) => e !== term);
        return extras.some((e) => haystack.includes(e));
      });
    });
  }, [query, cards]);

  const matchedCountries = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, countries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(input.trim() ? { q: input.trim() } : {});
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search cards by title, airline, aircraft..."
            autoFocus
            className="w-full border border-border bg-background pl-10 pr-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/50
                       placeholder:text-muted-foreground/50"
          />
        </div>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !query ? (
        <p className="text-muted-foreground text-center py-12">
          Type a search term to find cards.
        </p>
      ) : results.length === 0 && matchedCountries.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          No results found for "{query}"
        </p>
      ) : (
        <>
          {matchedCountries.length > 0 && (
            <div className="mb-8">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Countries</p>
              <div className="flex flex-wrap gap-3">
                {matchedCountries.map((country) => (
                  <Link
                    key={country.name}
                    to={`/airlines?q=${encodeURIComponent(country.name)}`}
                    className="flex items-center gap-2.5 rounded-lg border bg-card px-3.5 py-2.5
                               hover:shadow-md transition-shadow"
                  >
                    <span className="text-2xl" role="img" aria-label={country.name}>
                      {countryToFlag(country.name)}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{country.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {country.card_count} card{country.card_count !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                {results.length} card{results.length !== 1 ? 's' : ''} for "{query}"
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {results.map((card) => (
                  <PublicCardTile key={card.id} card={card} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};
