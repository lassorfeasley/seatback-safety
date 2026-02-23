import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { fetchManufacturersBrowse, type ManufacturerBrowse } from '@/lib/lookupService';

export const PublicManufacturersBrowse: React.FC = () => {
  const [manufacturers, setManufacturers] = useState<ManufacturerBrowse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchManufacturersBrowse().then((data) => {
      setManufacturers(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    });
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-8">Manufacturers</h1>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : manufacturers.length === 0 ? (
        <p className="text-muted-foreground py-12 text-center">No manufacturers found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {manufacturers.map((mfr) => (
            <Link
              key={mfr.id}
              to={`/manufacturers/${mfr.id}`}
              className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent/50
                         transition-colors group"
            >
              <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center
                              overflow-hidden flex-shrink-0">
                {mfr.logo_url ? (
                  <img src={mfr.logo_url} alt={mfr.name}
                       className="h-full w-full object-contain" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {mfr.name.charAt(0)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{mfr.name}</p>
                <p className="text-xs text-muted-foreground">
                  {mfr.card_count} card{mfr.card_count !== 1 ? 's' : ''}
                  {mfr.country ? ` · ${mfr.country}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
