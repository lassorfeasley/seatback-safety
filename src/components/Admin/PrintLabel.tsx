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
  const aircraftLabel = card.aircraft_label || '';
  const year = card.published_year ? String(card.published_year) : '';
  const revision = card.revision || '';
  const rightInfo = [year, revision].filter(Boolean).join(' \u00b7 ');

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <div className="label-toolbar sticky top-0 z-10 bg-card border-b px-6 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
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
          }}
        >
          {/* Label strip: top 1.5 inches */}
          <div
            style={{
              width: '100%',
              height: '1.5in',
              padding: '0.1in 0.18in',
              boxSizing: 'border-box',
            }}
          >
            {/* Outer border */}
            <div
              style={{
                width: '100%',
                height: '100%',
                border: '1.5px solid black',
                padding: '3px',
                boxSizing: 'border-box',
              }}
            >
              {/* Inner border */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  border: '0.5px solid black',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '0 0.2in',
                }}
              >
                {/* Airline name */}
                <div
                  style={{
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '18pt',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                    color: 'black',
                    lineHeight: 1.15,
                  }}
                >
                  {airlineName}
                </div>

                {/* Ornamental divider */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '50%',
                    margin: '4px 0 3px',
                    gap: '8px',
                  }}
                >
                  <div style={{ flex: 1, height: '0.5px', background: 'black' }} />
                  <span style={{ fontSize: '5pt', color: 'black', lineHeight: 1 }}>&#9670;</span>
                  <div style={{ flex: 1, height: '0.5px', background: 'black' }} />
                </div>

                {/* Aircraft + Year/Revision */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: aircraftLabel && rightInfo ? 'space-between' : 'center',
                    alignItems: 'baseline',
                    width: '100%',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '10pt',
                    color: 'black',
                    lineHeight: 1.2,
                  }}
                >
                  <span>{aircraftLabel}</span>
                  {rightInfo && (
                    <span style={{ whiteSpace: 'nowrap', marginLeft: '1em' }}>
                      {rightInfo}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
