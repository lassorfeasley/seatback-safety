import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchAirlinesBrowse, type AirlineBrowse } from '@/lib/lookupService';

export const PublicAirlinesBrowse: React.FC = () => {
  const [airlines, setAirlines] = useState<AirlineBrowse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAirlinesBrowse().then((data) => {
      setAirlines(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Airlines</h1>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : airlines.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No airlines found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {airlines.map((airline) => (
            <Link
              key={airline.id}
              to={`/airlines/${airline.id}`}
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent/50
                         transition-colors group"
            >
              <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center
                              overflow-hidden flex-shrink-0">
                {airline.logo_url ? (
                  <img src={airline.logo_url} alt={airline.name}
                       className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {airline.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{airline.name}</p>
                <p className="text-xs text-muted-foreground">
                  {airline.card_count} card{airline.card_count !== 1 ? 's' : ''}
                  {airline.country ? ` · ${airline.country}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
