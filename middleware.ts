import { NextRequest, NextResponse } from 'next/server';

const BOT_PATTERN =
  /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|Googlebot|bingbot|Baiduspider|iMessageBot|Applebot/i;

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export const config = {
  matcher: '/cards/:id*',
};

export default async function middleware(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  if (!BOT_PATTERN.test(ua)) {
    return NextResponse.next();
  }

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const cardId = segments[1];
  if (!cardId) return NextResponse.next();

  let title = 'Seatback Safety Card';
  let description = 'A seatback safety card from the Seatback Safety collection.';

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/safety_cards?id=eq.${cardId}&select=title,airlines(name)`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        },
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          const card = rows[0];
          if (card.title) title = card.title;
          const airlineName = card.airlines?.name;
          if (airlineName) {
            description = `${title} — ${airlineName}. From the Seatback Safety collection.`;
          }
        }
      }
    } catch {
      // Fall through with defaults
    }
  }

  const ogImageUrl = SUPABASE_URL
    ? `${SUPABASE_URL}/storage/v1/object/public/derivatives/${cardId}/og.jpg`
    : '';

  const siteUrl = `${url.protocol}//${url.host}`;
  const pageUrl = `${siteUrl}/cards/${cardId}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — Seatback Safety</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:site_name" content="Seatback Safety" />
  <meta property="og:url" content="${pageUrl}" />
  ${ogImageUrl ? `<meta property="og:image" content="${ogImageUrl}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  ${ogImageUrl ? `<meta name="twitter:image" content="${ogImageUrl}" />` : ''}
  <meta http-equiv="refresh" content="0;url=${pageUrl}" />
</head>
<body></body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
