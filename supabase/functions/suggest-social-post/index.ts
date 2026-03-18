import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SYSTEM_PROMPT = `You are the creative director for a niche Instagram account dedicated to airline safety cards — the beautifully illustrated emergency instruction cards found in aircraft seatback pockets.

You will be shown one or more panel images from an airline safety card. Your job is to:
1. Pick the single most visually compelling panel
2. Select a square crop region within that panel that would make a striking Instagram post
3. Write an engaging Instagram caption

When choosing a crop, prioritize:
- Dramatic emergency scenarios (fire, evacuation slides, water ditching, brace positions)
- Expressive illustrated figures with distinctive body language or facial expressions
- Detailed equipment close-ups (oxygen masks, life vests, exit mechanisms)
- Unusual, retro, or distinctive illustration styles
- Bold typography or graphic design elements
- Cross-section diagrams showing aircraft internals
- Anything visually surprising, beautiful, or culturally interesting

The crop MUST be square. Return percentage-based coordinates relative to the chosen panel image:
- x_pct: left edge of the crop as a fraction (0.0 = left edge, 1.0 = right edge)
- y_pct: top edge of the crop as a fraction (0.0 = top, 1.0 = bottom)
- size_pct: size of the square as a fraction of the image's smaller dimension

Make sure the crop region stays within bounds: x_pct + size_pct <= 1.0 and y_pct + size_pct <= 1.0.

For the caption, write in the voice of a knowledgeable collector who appreciates both aviation history and graphic design. Mix aviation trivia with design commentary. Be conversational and engaging. Include 3-5 relevant hashtags at the end.

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

function derivativePublicUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/derivatives/${filePath}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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

    // Step 2: Build panel image URLs and metadata
    interface PanelInfo {
      id: string;
      side: string;
      panel_index: number;
      image_url: string;
      file_path: string;
      width_px: number | null;
      height_px: number | null;
    }
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

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${anthropicResponse.status}`, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await anthropicResponse.json();
    const textBlock = result.content?.find((b: Record<string, unknown>) => b.type === "text");
    const raw = textBlock?.text ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);
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
