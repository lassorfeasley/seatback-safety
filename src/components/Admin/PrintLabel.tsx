import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCardDetail, type CardDetailData } from '@/lib/safetyCardService';
import { Loader2, ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PRINT_STYLES = `
  @media print {
    @page {
      size: 7.25in 10.5in;
      margin: 0;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
    }
    .label-toolbar {
      display: none !important;
    }
    .label-preview-bg {
      background: none !important;
      padding: 0 !important;
      min-height: auto !important;
    }
    .label-page {
      width: 7.25in !important;
      height: 10.5in !important;
      margin: 0 !important;
      box-shadow: none !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

export const PrintLabel: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [card, setCard] = useState<CardDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchCardDetail(id)
      .then(setCard)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!card || !id) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-background gap-3">
        <p className="text-sm text-muted-foreground">Card not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  const airlineName = card.airline_name || 'Unknown Airline';
  const year = card.published_year ? String(card.published_year) : '';

  const makes = [...new Set(card.aircraft?.map((a) => a.manufacturerName).filter(Boolean))];
  const models = [...new Set(
    card.aircraft?.map((a) => {
      const variantStr = a.variants.length > 0 ? a.variants.map((v) => v.name).join(', ') : a.variantName;
      return [a.modelName, variantStr].filter(Boolean).join(' ');
    }).filter(Boolean)
  )];

  const revision = card.revision || '';

  const crumbs = [
    makes.join(', '),
    models.join(', '),
    year,
    revision,
  ].filter(Boolean);

  const ogUrl = card.preview_url?.replace(/preview\.jpg$/, 'og.jpg') || '';

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <div className="label-toolbar sticky top-0 z-10 bg-card border-b px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else window.close();
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="label-preview-bg bg-muted/30 min-h-[calc(100dvh-52px)] flex justify-center p-8">
        <div
          className="label-page"
          style={{
            width: '7.25in',
            height: '10.5in',
            background: 'white',
            boxShadow: '0 2px 16px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
            flexShrink: 0,
            position: 'relative' as const,
            overflow: 'hidden',
          }}
        >
          {/* Label strip: top 1.5 inches */}
          <div
            style={{
              width: '100%',
              height: '1.5in',
              backgroundColor: 'white',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              padding: '0 0.3in',
            }}
          >
            <div
              style={{
                fontFamily: '"Funnel Display", system-ui, sans-serif',
                fontSize: '20pt',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'black',
                lineHeight: 1.15,
              }}
            >
              {airlineName}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '6px',
                fontFamily: '"Funnel Display", system-ui, sans-serif',
                fontSize: '8pt',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#a8a7b2',
                lineHeight: 1.2,
              }}
            >
              {crumbs.map((crumb, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {i > 0 && (
                    <span style={{ color: '#a8a7b2' }}>→</span>
                  )}
                  <span>{crumb}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Background fill from 1.8in down — matches OG image bg */}
          <div
            style={{
              position: 'absolute',
              top: '1.8in',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#a8a7b2',
              filter: 'grayscale(1)',
            }}
          />

          {/* OG image — 4in square, centered in shaded area */}
          {ogUrl && (
            <div
              style={{
                position: 'absolute',
                top: '1.8in',
                left: '0px',
                width: '4in',
                height: '4in',
              }}
            >
              <img
                src={ogUrl}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  filter: 'grayscale(1)',
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};
