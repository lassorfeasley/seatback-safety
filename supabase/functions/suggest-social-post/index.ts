import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const FALLBACK_SYSTEM_PROMPT = `You are the creative director for a niche Instagram account dedicated to airline safety cards — the beautifully illustrated emergency instruction cards found in aircraft seatback pockets.

You will be shown one or more panel images from an airline safety card. Your job is to:
1. Pick the single most visually compelling panel
2. Select a square crop region within that panel that would make a striking Instagram post
3. Write an engaging Instagram caption

The crop MUST be square. Return percentage-based coordinates relative to the chosen panel image:
- x_pct: left edge of the crop as a fraction (0.0 = left edge, 1.0 = right edge)
- y_pct: top edge of the crop as a fraction (0.0 = top, 1.0 = bottom)
- size_pct: size of the square as a fraction of the image's smaller dimension

Make sure the crop region stays within bounds: x_pct + size_pct <= 1.0 and y_pct + size_pct <= 1.0.

Return ONLY valid JSON:
{
  "chosen_panel_index": 0,
  "crop": {
    "x_pct": 0.15,
    "y_pct": 0.20,
    "size_pct": 0.45
  },
  "crop_description": "Brief description of what's in the crop",
  "caption": "The full Instagram caption with hashtags"
}`;

interface StyleDirective {
  label: string;
  directive: string;
  category: string;
  enforcement: string;
  sort_order: number;
}

function buildSystemPrompt(directives: StyleDirective[]): string {
  const sections: string[] = [
    `You are the creative director for a niche Instagram account dedicated to airline safety cards — the beautifully illustrated emergency instruction cards found in aircraft seatback pockets.

You will be shown one or more panel images from an airline safety card. Your job is to:
1. Pick the single most visually compelling panel
2. Select a square crop region within that panel that would make a striking Instagram post
3. Write a caption following the directives below`,
  ];

  const byCategory = new Map<string, StyleDirective[]>();
  for (const d of directives) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  const categoryHeadings: Record<string, string> = {
    format: 'CAPTION FORMAT',
    voice: 'VOICE & VOCABULARY',
    theme: 'THEMATIC SUBTEXT',
    crop: 'CROP SELECTION',
    hashtag: 'HASHTAGS',
    constraint: 'CONSTRAINTS',
    example: 'EXAMPLE CAPTIONS (tone references — do not copy verbatim)',
    general: 'GENERAL',
  };

  const categoryOrder = ['crop', 'format', 'voice', 'theme', 'hashtag', 'constraint', 'example', 'general'];

  const enforcementPrefix: Record<string, string> = {
    must: 'MUST:',
    should: 'SHOULD:',
    may: 'MAY (optional):',
  };

  for (const cat of categoryOrder) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    const heading = categoryHeadings[cat] ?? cat.toUpperCase();
    const body = items.map((d) => {
      const prefix = enforcementPrefix[d.enforcement] ?? '';
      return `• ${prefix ? prefix + ' ' : ''}${d.directive}`;
    }).join('\n\n');
    sections.push(`## ${heading}\n${body}`);
  }

  sections.push(`## RESPONSE FORMAT
The crop MUST be square. Return percentage-based coordinates relative to the chosen panel image:
- x_pct: left edge of the crop as a fraction (0.0 = left edge, 1.0 = right edge)
- y_pct: top edge of the crop as a fraction (0.0 = top, 1.0 = bottom)
- size_pct: size of the square as a fraction of the image's smaller dimension

Make sure the crop region stays within bounds: x_pct + size_pct <= 1.0 and y_pct + size_pct <= 1.0.

Return ONLY valid JSON:
{
  "chosen_panel_index": 0,
  "crop": {
    "x_pct": 0.15,
    "y_pct": 0.20,
    "size_pct": 0.45
  },
  "crop_description": "Brief description of what's in the crop",
  "caption": "The full caption with hashtags"
}`);

  return sections.join('\n\n');
}

const FALLBACK_CAPTION_ONLY_PROMPT = `You are the creative director for a niche Instagram account dedicated to airline safety cards.

The user has ALREADY chosen a square crop on a single panel image. Your ONLY job is to write an Instagram caption (and a short crop_description) for what appears in that crop.

Do NOT choose a different crop or panel.

Return ONLY valid JSON:
{
  "crop_description": "Brief description of what appears in the user's selected crop",
  "caption": "The full Instagram caption with hashtags"
}`;

function buildCaptionOnlySystemPrompt(directives: StyleDirective[]): string {
  const sections: string[] = [
    `You are the creative director for a niche Instagram account dedicated to airline safety cards — the beautifully illustrated emergency instruction cards found in aircraft seatback pockets.

The user has ALREADY selected a square crop on the panel image. You must NOT choose a crop or a different panel.
Your ONLY task is to write a caption (and a brief crop_description) following the directives below. Focus on what appears inside the described crop region.`,
  ];

  const byCategory = new Map<string, StyleDirective[]>();
  for (const d of directives) {
    if (d.category === "crop") continue;
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  const categoryHeadings: Record<string, string> = {
    format: "CAPTION FORMAT",
    voice: "VOICE & VOCABULARY",
    theme: "THEMATIC SUBTEXT",
    hashtag: "HASHTAGS",
    constraint: "CONSTRAINTS",
    example: "EXAMPLE CAPTIONS (tone references — do not copy verbatim)",
    general: "GENERAL",
  };

  const categoryOrder = ["format", "voice", "theme", "hashtag", "constraint", "example", "general"];

  const enforcementPrefix: Record<string, string> = {
    must: "MUST:",
    should: "SHOULD:",
    may: "MAY (optional):",
  };

  for (const cat of categoryOrder) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    const heading = categoryHeadings[cat] ?? cat.toUpperCase();
    const body = items.map((d) => {
      const prefix = enforcementPrefix[d.enforcement] ?? "";
      return `• ${prefix ? prefix + " " : ""}${d.directive}`;
    }).join("\n\n");
    sections.push(`## ${heading}\n${body}`);
  }

  sections.push(`## RESPONSE FORMAT
Return ONLY valid JSON (no markdown fences):
{
  "crop_description": "Brief description of what appears in the user's selected crop",
  "caption": "The full caption with hashtags"
}`);

  return sections.join("\n\n");
}

function isValidManualCrop(c: { x_pct: number; y_pct: number; size_pct: number }): boolean {
  const { x_pct, y_pct, size_pct } = c;
  if (![x_pct, y_pct, size_pct].every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (size_pct <= 0 || size_pct > 1) return false;
  if (x_pct < 0 || y_pct < 0 || x_pct > 1 || y_pct > 1) return false;
  return true;
}

interface PanelInfo {
  id: string;
  side: string;
  panel_index: number;
  image_url: string;
  file_path: string;
  width_px: number | null;
  height_px: number | null;
}

function collectPanelInfos(card: Record<string, unknown>): PanelInfo[] {
  const panelInfos: PanelInfo[] = [];
  for (const side of (card.card_sides as Array<Record<string, unknown>>) ?? []) {
    for (const panel of (side.card_panels as Array<Record<string, unknown>>) ?? []) {
      const images = (panel.panel_images as Array<Record<string, unknown>>) ?? [];
      const display = images.find((i) => i.variant === "display")
        ?? images.find((i) => i.variant === "full");
      if (display) {
        panelInfos.push({
          id: panel.id as string,
          side: side.side as string,
          panel_index: panel.panel_index as number,
          image_url: derivativePublicUrl(display.file_path as string),
          file_path: display.file_path as string,
          width_px: (display.width_px as number) ?? null,
          height_px: (display.height_px as number) ?? null,
        });
      }
    }
  }
  return panelInfos;
}

function derivativePublicUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/derivatives/${filePath}`;
}

async function callClaude(systemPrompt: string, userContent: unknown[]): Promise<Record<string, unknown>> {
  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text();
    throw new Error(`Anthropic API error: ${anthropicResponse.status} ${errText}`);
  }

  const result = await anthropicResponse.json();
  const textBlock = result.content?.find((b: Record<string, unknown>) => b.type === "text");
  const raw = textBlock?.text ?? "";

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not parse AI response: ${raw}`);
  }

  return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let requestBody: Record<string, unknown> = {};
    if (req.method === "POST") {
      try {
        requestBody = await req.json() as Record<string, unknown>;
      } catch {
        /* empty body */
      }
    }

    const { data: directiveRows } = requestBody.mode !== "simple_og"
      ? await supabase
          .from("social_style_directives")
          .select("label, directive, category, enforcement, sort_order")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
      : { data: null };

    if (requestBody.mode === "simple_og" || requestBody.mode === "batch_schedule") {
      const isBatch = requestBody.mode === "batch_schedule";
      const schedDates: string[] = [];

      if (isBatch) {
        const startDate = requestBody.start_date as string | undefined;
        const endDate = requestBody.end_date as string | undefined;
        const postTime = (requestBody.post_time as string) ?? "13:00";
        if (!startDate || !endDate) {
          return new Response(
            JSON.stringify({ error: "batch_schedule requires start_date and end_date (YYYY-MM-DD)" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const cur = new Date(startDate + "T00:00:00Z");
        const end = new Date(endDate + "T00:00:00Z");
        if (isNaN(cur.getTime()) || isNaN(end.getTime()) || cur > end) {
          return new Response(
            JSON.stringify({ error: "Invalid date range" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const maxDays = 90;
        let count = 0;
        while (cur <= end && count < maxDays) {
          const dateStr = cur.toISOString().slice(0, 10);
          schedDates.push(`${dateStr}T${postTime}:00Z`);
          cur.setUTCDate(cur.getUTCDate() + 1);
          count++;
        }
      }

      const { data: allCards, error: allErr } = await supabase
        .from("safety_cards")
        .select(`
          id,
          title,
          published_year,
          airline:airlines(name),
          card_aircraft(
            aircraft_variant:aircraft_variants(
              name,
              aircraft_model:aircraft_models(
                name,
                manufacturer:aircraft_manufacturers(name)
              )
            )
          ),
          card_sides(
            side,
            card_panels(
              id,
              panel_index,
              panel_images(variant, file_path)
            )
          )
        `)
        .limit(200);

      if (allErr) {
        return new Response(
          JSON.stringify({ error: "Failed to query cards", detail: allErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const hasImages = (c: Record<string, unknown>) => {
        const sides = (c.card_sides as Array<Record<string, unknown>>) ?? [];
        return sides.some((s) =>
          ((s.card_panels as Array<Record<string, unknown>>) ?? []).some((p) =>
            ((p.panel_images as Array<Record<string, unknown>>) ?? []).length > 0
          )
        );
      };
      const eligible = (allCards ?? []).filter((c: Record<string, unknown>) => hasImages(c));

      if (eligible.length === 0) {
        return new Response(
          JSON.stringify({ error: "No cards with images found" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: existingOg } = await supabase
        .from("social_posts")
        .select("card_id");
      const usedIds = new Set(
        (existingOg ?? []).map((p: Record<string, unknown>) => p.card_id)
      );
      const fresh = eligible.filter((c: Record<string, unknown>) => !usedIds.has(c.id));

      function buildCaption(card: Record<string, unknown>) {
        const an = (card.airline as Record<string, unknown>)?.name as string ?? "";
        const acE = (card.card_aircraft as Array<Record<string, unknown>>) ?? [];
        const acL = acE.map((entry) => {
          const v = entry.aircraft_variant as Record<string, unknown>;
          const m = v?.aircraft_model as Record<string, unknown>;
          const mfr = m?.manufacturer as Record<string, unknown>;
          return [mfr?.name as string, m?.name as string, v?.name as string].filter(Boolean).join(" ");
        });
        const ac = acL.length > 0 ? acL.join(", ") : "";
        const yr = card.published_year as number | null;
        const p = [an, ac].filter(Boolean).join(" ");
        const ys = yr ? ` c. ${yr}` : "";
        return { caption: `✈️ ${p} #SeatbackSafety card${ys}`, airlineName: an, aircraft: ac };
      }

      if (isBatch) {
        const batchPool = [...fresh];
        const usedInBatch = new Set<string>();
        const results: Array<Record<string, unknown>> = [];

        for (const schedIso of schedDates) {
          let available = batchPool.filter((c) => !usedInBatch.has(c.id as string));
          if (available.length === 0) {
            available = eligible.filter((c) => !usedInBatch.has(c.id as string));
          }
          if (available.length === 0) break;

          const card = available[Math.floor(Math.random() * available.length)] as Record<string, unknown>;
          usedInBatch.add(card.id as string);

          const panels = collectPanelInfos(card);
          if (panels.length === 0) continue;

          const { caption } = buildCaption(card);
          const ogPath = `${card.id}/og.jpg`;

          const { data: row, error: insErr } = await supabase
            .from("social_posts")
            .insert({
              card_id: card.id,
              panel_id: panels[0].id,
              crop_x_pct: 0,
              crop_y_pct: 0,
              crop_size_pct: 1,
              crop_image_path: ogPath,
              caption,
              status: "scheduled",
              scheduled_at: schedIso,
            })
            .select()
            .single();

          if (!insErr && row) results.push(row as Record<string, unknown>);
        }

        return new Response(
          JSON.stringify({ posts: results, count: results.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const ogPool = fresh.length > 0 ? fresh : eligible;
      const picked = ogPool[Math.floor(Math.random() * ogPool.length)] as Record<string, unknown>;
      const { caption, airlineName, aircraft: acStr } = buildCaption(picked);

      const ogImagePath = `${picked.id}/og.jpg`;

      const panelInfosOg = collectPanelInfos(picked);
      const firstPanel = panelInfosOg[0];
      if (!firstPanel) {
        return new Response(
          JSON.stringify({ error: "Card has no panels" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const scheduledAt = requestBody.auto_publish
        ? new Date().toISOString()
        : null;

      const { data: ogPost, error: ogInsertErr } = await supabase
        .from("social_posts")
        .insert({
          card_id: picked.id,
          panel_id: firstPanel.id,
          crop_x_pct: 0,
          crop_y_pct: 0,
          crop_size_pct: 1,
          crop_image_path: ogImagePath,
          caption,
          status: requestBody.auto_publish ? "scheduled" : "draft",
          scheduled_at: scheduledAt,
        })
        .select()
        .single();

      if (ogInsertErr) {
        return new Response(
          JSON.stringify({ error: "Failed to insert post", detail: ogInsertErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          post: ogPost,
          card_title: picked.title,
          airline_name: airlineName,
          aircraft: acStr,
          panel_image_url: derivativePublicUrl(ogImagePath),
          crop_description: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (requestBody.mode === "manual_crop") {
      if (!ANTHROPIC_API_KEY) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const cardId = requestBody.card_id as string | undefined;
      const panelId = requestBody.panel_id as string | undefined;
      const croppedImagePath = requestBody.cropped_image_path as string | undefined;
      const cropRaw = requestBody.crop as Record<string, unknown> | undefined;
      const crop = {
        x_pct: Number(cropRaw?.x_pct),
        y_pct: Number(cropRaw?.y_pct),
        size_pct: Number(cropRaw?.size_pct),
      };

      if (!cardId || !panelId) {
        return new Response(
          JSON.stringify({ error: "manual_crop requires card_id and panel_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const useUploadedSquare = typeof croppedImagePath === "string" &&
        croppedImagePath.length > 0 &&
        croppedImagePath.startsWith(`${cardId}/`);

      if (!useUploadedSquare) {
        if (!cropRaw) {
          return new Response(
            JSON.stringify({ error: "manual_crop requires crop or cropped_image_path" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (!isValidManualCrop(crop)) {
          return new Response(
            JSON.stringify({ error: "Invalid crop values", crop }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const captionSystem = directiveRows && directiveRows.length > 0
        ? buildCaptionOnlySystemPrompt(directiveRows as StyleDirective[])
        : FALLBACK_CAPTION_ONLY_PROMPT;

      const { data: oneCard, error: oneErr } = await supabase
        .from("safety_cards")
        .select(`
          id,
          title,
          published_year,
          airline:airlines(name),
          card_aircraft(
            aircraft_variant:aircraft_variants(
              name,
              aircraft_model:aircraft_models(
                name,
                manufacturer:aircraft_manufacturers(name)
              )
            )
          ),
          card_sides(
            side,
            card_panels(
              id,
              panel_index,
              panel_images(variant, file_path, width_px, height_px)
            )
          )
        `)
        .eq("id", cardId)
        .single();

      if (oneErr || !oneCard) {
        return new Response(
          JSON.stringify({ error: "Card not found", detail: oneErr?.message }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const cardRecord = oneCard as Record<string, unknown>;
      const panelInfosManual = collectPanelInfos(cardRecord);
      const chosenPanel = panelInfosManual.find((p) => p.id === panelId);
      if (!chosenPanel) {
        return new Response(
          JSON.stringify({ error: "Panel not found on this card" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const airline = (cardRecord.airline as Record<string, unknown>)?.name as string ?? "Unknown airline";
      const aircraftEntries = (cardRecord.card_aircraft as Array<Record<string, unknown>>) ?? [];
      const aircraftLabels = aircraftEntries.map((entry) => {
        const variant = entry.aircraft_variant as Record<string, unknown>;
        const model = variant?.aircraft_model as Record<string, unknown>;
        const mfr = model?.manufacturer as Record<string, unknown>;
        const parts = [
          mfr?.name as string,
          model?.name as string,
          variant?.name as string,
        ].filter(Boolean);
        return parts.join(" ");
      });
      const aircraftStr = aircraftLabels.length > 0 ? aircraftLabels.join(", ") : "Unknown aircraft";
      const year = cardRecord.published_year as number | null;

      const metaLine =
        `Card metadata (for context only; follow directives about whether to mention it): Airline: ${airline} | Aircraft: ${aircraftStr} | Year: ${year ?? "Unknown"} | Title: ${(cardRecord.title as string) ?? "Untitled"}`;

      const userContentManual = useUploadedSquare
        ? [
          {
            type: "image" as const,
            source: { type: "url" as const, url: derivativePublicUrl(croppedImagePath!) },
          },
          {
            type: "text" as const,
            text: `This image is the user's exact square crop from the full safety-card side (panels laid flush; the crop may span two adjacent panels). Write the caption for what appears in this image only.

${metaLine}`,
          },
        ]
        : [
          {
            type: "image" as const,
            source: { type: "url" as const, url: chosenPanel.image_url },
          },
          {
            type: "text" as const,
            text: `This is the full panel image. The user selected a square crop for the Instagram post using these normalized values (same convention as your training):
- x_pct: left edge of the square at ${crop.x_pct} × image width from the left
- y_pct: top edge of the square at ${crop.y_pct} × image height from the top
- size_pct: square side length = ${crop.size_pct} × min(image width, image height)

Write the caption to match what appears in that square region.

${metaLine}`,
          },
        ];

      let parsedManual: Record<string, unknown>;
      try {
        parsedManual = await callClaude(captionSystem, userContentManual);
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: e instanceof Error ? e.message : String(e),
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const insertPayload = useUploadedSquare
        ? {
          card_id: cardId,
          panel_id: chosenPanel.id,
          crop_x_pct: 0,
          crop_y_pct: 0,
          crop_size_pct: 1,
          crop_image_path: croppedImagePath!,
          caption: (parsedManual.caption as string) ?? "",
          status: "draft" as const,
        }
        : {
          card_id: cardId,
          panel_id: chosenPanel.id,
          crop_x_pct: crop.x_pct,
          crop_y_pct: crop.y_pct,
          crop_size_pct: crop.size_pct,
          caption: (parsedManual.caption as string) ?? "",
          status: "draft" as const,
        };

      const { data: postManual, error: insertManualErr } = await supabase
        .from("social_posts")
        .insert(insertPayload)
        .select()
        .single();

      if (insertManualErr) {
        return new Response(
          JSON.stringify({ error: "Failed to insert social post", detail: insertManualErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const panelImageUrlOut = useUploadedSquare
        ? derivativePublicUrl(croppedImagePath!)
        : chosenPanel.image_url;

      return new Response(
        JSON.stringify({
          post: postManual,
          card_title: cardRecord.title,
          airline_name: airline,
          aircraft: aircraftStr,
          panel_image_url: panelImageUrlOut,
          crop_description: parsedManual.crop_description ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = directiveRows && directiveRows.length > 0
      ? buildSystemPrompt(directiveRows as StyleDirective[])
      : FALLBACK_SYSTEM_PROMPT;

    // Step 1: Pick a random card that has panel images, avoiding recently posted cards
    const { data: cards, error: cardError } = await supabase
      .from("safety_cards")
      .select(`
        id,
        title,
        published_year,
        airline:airlines(name),
        card_aircraft(
          aircraft_variant:aircraft_variants(
            name,
            aircraft_model:aircraft_models(
              name,
              manufacturer:aircraft_manufacturers(name)
            )
          )
        ),
        card_sides(
          side,
          card_panels(
            id,
            panel_index,
            panel_images(variant, file_path, width_px, height_px)
          )
        )
      `)
      .limit(50);

    if (cardError) {
      return new Response(
        JSON.stringify({ error: "Failed to query cards", detail: cardError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter to cards that actually have display images
    const eligibleCards = (cards ?? []).filter((card: Record<string, unknown>) => {
      const sides = card.card_sides as Array<Record<string, unknown>> ?? [];
      return sides.some((side) =>
        ((side.card_panels as Array<Record<string, unknown>>) ?? []).some((panel) =>
          ((panel.panel_images as Array<Record<string, unknown>>) ?? []).some(
            (img) => img.variant === "display" || img.variant === "full"
          )
        )
      );
    });

    if (eligibleCards.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cards with panel images found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Exclude cards that already have social posts
    const { data: existingPosts } = await supabase
      .from("social_posts")
      .select("card_id");

    const usedCardIds = new Set(
      (existingPosts ?? []).map((p: Record<string, unknown>) => p.card_id)
    );
    const freshCards = eligibleCards.filter(
      (c: Record<string, unknown>) => !usedCardIds.has(c.id)
    );
    const pool = freshCards.length > 0 ? freshCards : eligibleCards;

    // Pick one at random
    const card = pool[Math.floor(Math.random() * pool.length)] as Record<string, unknown>;

    const panelInfos = collectPanelInfos(card as Record<string, unknown>);

    if (panelInfos.length === 0) {
      return new Response(
        JSON.stringify({ error: "Selected card has no usable panel images" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build metadata string for caption context
    const airline = (card.airline as Record<string, unknown>)?.name as string ?? "Unknown airline";
    const aircraftEntries = (card.card_aircraft as Array<Record<string, unknown>>) ?? [];
    const aircraftLabels = aircraftEntries.map((entry) => {
      const variant = entry.aircraft_variant as Record<string, unknown>;
      const model = variant?.aircraft_model as Record<string, unknown>;
      const mfr = model?.manufacturer as Record<string, unknown>;
      const parts = [
        mfr?.name as string,
        model?.name as string,
        variant?.name as string,
      ].filter(Boolean);
      return parts.join(" ");
    });
    const aircraftStr = aircraftLabels.length > 0 ? aircraftLabels.join(", ") : "Unknown aircraft";
    const year = card.published_year as number | null;

    // Step 3: Send to Claude Vision
    const imageContent = panelInfos.map((p, idx) => ([
      {
        type: "text" as const,
        text: `Panel ${idx} (${p.side} side, index ${p.panel_index}):`,
      },
      {
        type: "image" as const,
        source: { type: "url" as const, url: p.image_url },
      },
    ])).flat();

    const userContent = [
      ...imageContent,
      {
        type: "text" as const,
        text: `Card metadata — Airline: ${airline} | Aircraft: ${aircraftStr} | Year: ${year ?? "Unknown"} | Title: ${(card.title as string) ?? "Untitled"}

Analyze all ${panelInfos.length} panels above. Pick the one with the most visually striking detail and select a square crop region that would make a compelling Instagram post. Then write a caption.`,
      },
    ];

    let parsed: Record<string, unknown>;
    try {
      parsed = await callClaude(systemPrompt, userContent);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const chosenIdx = parsed.chosen_panel_index ?? 0;
    const chosenPanel = panelInfos[chosenIdx] ?? panelInfos[0];
    const crop = parsed.crop ?? { x_pct: 0.1, y_pct: 0.1, size_pct: 0.5 };

    // Step 4: Insert draft into social_posts
    const { data: post, error: insertError } = await supabase
      .from("social_posts")
      .insert({
        card_id: card.id,
        panel_id: chosenPanel.id,
        crop_x_pct: crop.x_pct,
        crop_y_pct: crop.y_pct,
        crop_size_pct: crop.size_pct,
        caption: parsed.caption ?? "",
        status: "draft",
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to insert social post", detail: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        post,
        card_title: card.title,
        airline_name: airline,
        aircraft: aircraftStr,
        panel_image_url: chosenPanel.image_url,
        crop_description: parsed.crop_description,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
