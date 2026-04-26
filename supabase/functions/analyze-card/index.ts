import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `You are an expert at identifying airline safety cards. Given one or more scanned images of a safety card, extract as much metadata as you can.

Return ONLY valid JSON with this exact structure (use null for any field you cannot determine):
{
  "airline": "Full airline name" | null,
  "aircraft": [
    { "manufacturer": "e.g. Boeing", "model": "e.g. 737", "variant": "e.g. 800" | null }
  ],
  "languages": ["English", "Spanish", ...],
  "published_year": 2024 | null,
  "revision": "e.g. Rev C, 05/2019" | null,
  "suggested_title": "A concise descriptive title for this card" | null
}

Guidelines:
- For airline, identify the airline from any branding, logos, or text visible on the card, then return its full official trade name. Use your aviation knowledge to expand abbreviations and shorthand — e.g. if the card shows "jetBlue", return "JetBlue Airways"; if it shows "BA", return "British Airways"; if it shows "KLM", return "KLM Royal Dutch Airlines"; if it shows "SAS", return "Scandinavian Airlines System"; if it shows "ANA", return "All Nippon Airways"; if it shows "JAL", return "Japan Airlines"; if it shows "TWA", return "Trans World Airlines"
- Always include common suffixes like "Airlines", "Airways", "Air Lines" where they are part of the official brand name (e.g. "Southwest Airlines" not "Southwest", "American Airlines" not "American", "Republic Airways" not "Republic")
- Use the English marketing/trade name, not the legal holding company name (e.g. "Lufthansa" not "Deutsche Lufthansa AG", "Air France" not "Societe Air France")
- For defunct or historical airlines, use the name as it appeared during the era of the card's publication
- The aircraft array should contain one entry PER distinct model on the card. Many safety cards cover multiple models from the same manufacturer (e.g. "E170/175" = two entries: E170 and E175; "737-800/900" = two entries: 737 with variant 800 and 737 with variant 900; "A319/A320/A321" = three entries)
- Separate manufacturer, model, and variant carefully. Variants include numeric suffixes like 800, 900ER AND letter suffixes like SR, LR, ER, NEO, MAX, F, Adv, Combi, etc. Do NOT include a leading dash/hyphen in the variant — use "800" not "-800", "200" not "-200". For example "A320 SR" → model "A320", variant "SR"; "747-400 Combi" → model "747", variant "400 Combi"; "737 MAX 8" → model "737", variant "MAX 8"; "727-200" → model "727", variant "200"
- Use your aviation domain knowledge to identify the manufacturer even when it is not explicitly written on the card. Model designation prefixes reliably identify the manufacturer. Always provide the manufacturer — if the model prefix or aircraft silhouette makes it identifiable, that is not guessing.
- The "model" field should be the SHORT model identifier as it would appear in a manufacturer's product line — NOT the full designation with manufacturer prefix. Since the manufacturer is already a separate field, strip any manufacturer prefix from the model. Examples: "MD-11" → manufacturer "McDonnell Douglas", model "11"; "MD-80" → model "80"; "DC-10" → manufacturer "McDonnell Douglas", model "DC-10"; "DC-9" → model "DC-9"; "L-1011" → manufacturer "Lockheed", model "L-1011"; "BAe 146" → manufacturer "British Aerospace", model "146"; "CRJ-200" → manufacturer "Bombardier", model "CRJ-200"; "ERJ-145" → manufacturer "Embraer", model "ERJ-145"; "ATR 72" → manufacturer "ATR", model "72"; "DHC-8" → manufacturer "de Havilland Canada", model "DHC-8"; "F100" → manufacturer "Fokker", model "F100"; "Do 328" → manufacturer "Dornier", model "328"; "Tu-154" → manufacturer "Tupolev", model "154"; "Il-96" → manufacturer "Ilyushin", model "96". For Boeing and Airbus, the model is already just a number: "737", "747", "A320", "A380". The rule: use the shortest name that uniquely identifies the model within that manufacturer's lineup.
- Languages should be an array of language names found on the card
- published_year: Look carefully for a 4-digit year anywhere on the card. If no standalone year is visible, try to extract one from the revision string, date codes, or document numbers. Two-digit years are common — interpret them as 19xx for values 50-99 and 20xx for values 00-49. Examples: "I/P 3 FEB 2002" → 2002, "05JAN22" → 2022, "REV 09/2019" → 2019, "10APR.12.092" → 2012, "REV. 6/98" → 1998, "EB-250 REV. 6/98" → 1998, "03/01" → 2001, "Rev A 11/87" → 1987, "7/05" → 2005. Revision codes are often cryptic alphanumeric strings that do NOT contain a date — only extract a year if you are confident one is embedded.
- revision: Capture the full revision identifier, date code, or document number exactly as printed on the card, including any cryptic alphanumeric strings
- suggested_title should combine airline + aircraft in a natural way (e.g. "Republic Airways E170/175 Safety Card"). If you cannot identify BOTH the airline and at least one aircraft model, return null for suggested_title — never return a generic fallback like "Safety Card" or "Aircraft Safety Card"
- Only include information you can actually see on the card. Do not fabricate details, but DO use standard aviation knowledge to infer the manufacturer from the model designation (e.g. "MD-11" implies McDonnell Douglas, "A320" implies Airbus, "747" implies Boeing).`;

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
    const { imageUrls, base64Images, existingAirlines } = await req.json() as {
      imageUrls?: string[];
      base64Images?: Array<{ data: string; mediaType: string }>;
      existingAirlines?: string[];
    };

    const content: Array<Record<string, unknown>> = [];
    const fetchErrors: string[] = [];

    if (base64Images && base64Images.length > 0) {
      for (const img of base64Images.slice(0, 8)) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.data },
        });
      }
    } else if (imageUrls && imageUrls.length > 0) {
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
    }

    if (content.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Could not load any images",
          detail: fetchErrors.length > 0
            ? `Fetch failures: ${fetchErrors.join('; ')}`
            : "No image URLs or base64 data provided",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    content.push({
      type: "text",
      text: "Analyze this airline safety card and extract the metadata as specified.",
    });

    let systemPrompt = SYSTEM_PROMPT;
    if (existingAirlines && existingAirlines.length > 0) {
      systemPrompt += `\n\nIMPORTANT — The database already contains the following airlines. If the airline on this card matches or is clearly the same as one of these names (even if the spelling, capitalization, or abbreviation differs), you MUST return the EXACT name from this list. Only return a new name if the airline is genuinely not in this list.\n\nExisting airlines:\n${existingAirlines.map((n: string) => `- ${n}`).join('\n')}`;
    }

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
        system: systemPrompt,
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
