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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
          {manufacturers.map((mfr) => (
            <Link
              key={mfr.id}
              to={`/manufacturers/${mfr.id}`}
              className="group flex flex-col overflow-hidden
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="aspect-square bg-muted/60 relative overflow-hidden flex items-center justify-center">
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
                <p className="text-xs text-muted-foreground truncate mt-0.5">
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
