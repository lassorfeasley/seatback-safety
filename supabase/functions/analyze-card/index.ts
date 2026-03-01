import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `You are an expert at identifying airline safety cards. Given one or more scanned images of a safety card, extract as much metadata as you can.

Return ONLY valid JSON with this exact structure (use null for any field you cannot determine):
{
  "airline": "Full airline name" | null,
  "aircraft": [
    { "manufacturer": "e.g. Boeing", "model": "e.g. 737", "variant": "e.g. -800" | null }
  ],
  "languages": ["English", "Spanish", ...],
  "published_year": 2024 | null,
  "revision": "e.g. Rev C, 05/2019" | null,
  "suggested_title": "A concise descriptive title for this card" | null
}

Guidelines:
- For airline, use the full official name (e.g. "Republic Airways" not "Republic")
- The aircraft array should contain one entry PER distinct model on the card. Many safety cards cover multiple models from the same manufacturer (e.g. "E170/175" = two entries: E170 and E175; "737-800/900" = two entries: 737 with variant -800 and 737 with variant -900; "A319/A320/A321" = three entries)
- Separate manufacturer, model, and variant carefully. Variants include numeric suffixes like -800, -900ER AND letter suffixes like SR, LR, ER, NEO, MAX, F, Adv, Combi, etc. For example "A320 SR" → model "A320", variant "SR"; "747-400 Combi" → model "747", variant "-400 Combi"; "737 MAX 8" → model "737", variant "MAX 8"
- Languages should be an array of language names found on the card
- published_year: Look carefully for a 4-digit year anywhere on the card. If no standalone year is visible, try to extract one from the revision string, date codes, or document numbers. Two-digit years are common — interpret them as 19xx for values 50-99 and 20xx for values 00-49. Examples: "I/P 3 FEB 2002" → 2002, "05JAN22" → 2022, "REV 09/2019" → 2019, "10APR.12.092" → 2012, "REV. 6/98" → 1998, "EB-250 REV. 6/98" → 1998, "03/01" → 2001, "Rev A 11/87" → 1987, "7/05" → 2005. Revision codes are often cryptic alphanumeric strings that do NOT contain a date — only extract a year if you are confident one is embedded.
- revision: Capture the full revision identifier, date code, or document number exactly as printed on the card, including any cryptic alphanumeric strings
- suggested_title should combine airline + aircraft in a natural way (e.g. "Republic Airways E170/175 Safety Card")
- Only include information you can actually see on the card. Do not guess.`;

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

  try {
    const { imageUrls } = await req.json() as { imageUrls: string[] };

    if (!imageUrls || imageUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: "No image URLs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content: Array<Record<string, unknown>> = [];
    const fetchErrors: string[] = [];

    for (const url of imageUrls.slice(0, 8)) {
      try {
        const probe = await fetch(url, { method: "HEAD" });
        if (!probe.ok) {
          fetchErrors.push(`${probe.status}`);
          continue;
        }
        content.push({
          type: "image",
          source: { type: "url", url },
        });
      } catch (e) {
        fetchErrors.push(e instanceof Error ? e.message : "fetch error");
      }
    }

    if (content.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Could not load any images",
          detail: fetchErrors.length > 0
            ? `Fetch failures: ${fetchErrors.join('; ')}`
            : `Received ${imageUrls.length} URL(s) but none were loadable`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    content.push({
      type: "text",
      text: "Analyze this airline safety card and extract the metadata as specified.",
    });

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
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

    return new Response(
      JSON.stringify({ suggestions: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
