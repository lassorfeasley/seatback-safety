import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const INSTAGRAM_BUSINESS_ACCOUNT_ID = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
const META_GRAPH_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") ?? "v21.0";

function derivativePublicUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/derivatives/${filePath}`;
}

function buildCaption(card: Record<string, unknown>): string {
  const airline = (card.airline as Record<string, unknown>)?.name as string ?? "";
  const acEntries = (card.card_aircraft as Array<Record<string, unknown>>) ?? [];
  const acLabels = acEntries.map((entry) => {
    const v = entry.aircraft_variant as Record<string, unknown>;
    const m = v?.aircraft_model as Record<string, unknown>;
    const mfr = m?.manufacturer as Record<string, unknown>;
    return [mfr?.name as string, m?.name as string, v?.name as string].filter(Boolean).join(" ");
  });
  const ac = acLabels.length > 0 ? acLabels.join(", ") : "";
  const yr = card.published_year as number | null;
  const parts = [airline, ac].filter(Boolean).join(" ");
  const yearSuffix = yr ? ` c. ${yr}` : "";
  return `✈️ ${parts} #SeatbackSafety card${yearSuffix}`;
}

async function publishToInstagram(
  imageUrl: string,
  caption: string,
): Promise<{ mediaId: string; permalink: string | null }> {
  const igId = INSTAGRAM_BUSINESS_ACCOUNT_ID!;
  const token = META_ACCESS_TOKEN!;
  const ver = META_GRAPH_API_VERSION;

  const createBody = new URLSearchParams({
    image_url: imageUrl,
    caption: caption.slice(0, 2200),
    access_token: token,
  });
  const createRes = await fetch(`https://graph.facebook.com/${ver}/${igId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: createBody,
  });
  const createJson = await createRes.json();
  if (!createRes.ok || createJson.error) {
    throw new Error(createJson.error?.message ?? `Graph API HTTP ${createRes.status}`);
  }
  const creationId = createJson.id as string;
  if (!creationId) throw new Error("Instagram media create returned no id");

  for (let i = 0; i < 45; i++) {
    const qs = new URLSearchParams({ fields: "status_code", access_token: token });
    const statusRes = await fetch(`https://graph.facebook.com/${ver}/${creationId}?${qs}`);
    const statusJson = await statusRes.json();
    const code = statusJson.status_code as string | undefined;
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") throw new Error(`Container status: ${code}`);
    if (i === 44) throw new Error("Timeout waiting for media container");
    await new Promise((r) => setTimeout(r, 1500));
  }

  const pubBody = new URLSearchParams({ creation_id: creationId, access_token: token });
  const pubRes = await fetch(`https://graph.facebook.com/${ver}/${igId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: pubBody,
  });
  const pubJson = await pubRes.json();
  if (!pubRes.ok || pubJson.error) {
    throw new Error(pubJson.error?.message ?? `Publish HTTP ${pubRes.status}`);
  }
  const mediaId = pubJson.id as string;

  let permalink: string | null = null;
  try {
    const infoQs = new URLSearchParams({ fields: "permalink", access_token: token });
    const infoRes = await fetch(`https://graph.facebook.com/${ver}/${mediaId}?${infoQs}`);
    const infoJson = await infoRes.json();
    permalink = (infoJson.permalink as string) ?? null;
  } catch { /* optional */ }

  return { mediaId, permalink };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!META_ACCESS_TOKEN || !INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    return new Response(
      JSON.stringify({ error: "Missing META_ACCESS_TOKEN or INSTAGRAM_BUSINESS_ACCOUNT_ID" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Pick a random card with images
    const { data: cards, error: cardErr } = await supabase
      .from("safety_cards")
      .select(`
        id, title, published_year,
        airline:airlines(name),
        card_aircraft(
          aircraft_variant:aircraft_variants(
            name,
            aircraft_model:aircraft_models(name, manufacturer:aircraft_manufacturers(name))
          )
        ),
        card_sides(side, card_panels(id, panel_index, panel_images(variant, file_path)))
      `)
      .limit(200);

    if (cardErr) {
      return new Response(
        JSON.stringify({ error: "Failed to query cards", detail: cardErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eligible = (cards ?? []).filter((c: Record<string, unknown>) => {
      const sides = (c.card_sides as Array<Record<string, unknown>>) ?? [];
      return sides.some((s) =>
        ((s.card_panels as Array<Record<string, unknown>>) ?? []).some((p) =>
          ((p.panel_images as Array<Record<string, unknown>>) ?? []).length > 0
        )
      );
    });

    if (eligible.length === 0) {
      return new Response(
        JSON.stringify({ error: "No cards with images found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: existingPosts } = await supabase.from("social_posts").select("card_id");
    const usedIds = new Set((existingPosts ?? []).map((p: Record<string, unknown>) => p.card_id));
    const fresh = eligible.filter((c: Record<string, unknown>) => !usedIds.has(c.id));
    const pool = fresh.length > 0 ? fresh : eligible;
    const card = pool[Math.floor(Math.random() * pool.length)] as Record<string, unknown>;

    const sides = (card.card_sides as Array<Record<string, unknown>>) ?? [];
    let panelId: string | null = null;
    for (const side of sides) {
      const panels = (side.card_panels as Array<Record<string, unknown>>) ?? [];
      if (panels.length > 0) {
        panelId = panels[0].id as string;
        break;
      }
    }
    if (!panelId) {
      return new Response(
        JSON.stringify({ error: "Card has no panels" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const caption = buildCaption(card);
    const ogImagePath = `${card.id}/og.jpg`;
    const imageUrl = derivativePublicUrl(ogImagePath);

    // Insert post
    const { data: post, error: insertErr } = await supabase
      .from("social_posts")
      .insert({
        card_id: card.id,
        panel_id: panelId,
        crop_x_pct: 0,
        crop_y_pct: 0,
        crop_size_pct: 1,
        crop_image_path: ogImagePath,
        caption,
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: "Failed to insert post", detail: insertErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Publish to Instagram
    const nowIso = new Date().toISOString();
    await supabase.from("social_posts").update({
      publish_attempted_at: nowIso,
      publish_error: null,
      updated_at: nowIso,
    }).eq("id", post.id);

    try {
      const { mediaId, permalink } = await publishToInstagram(imageUrl, caption);
      const postedIso = new Date().toISOString();
      await supabase.from("social_posts").update({
        status: "posted",
        posted_at: postedIso,
        instagram_media_id: mediaId,
        instagram_permalink: permalink,
        publish_error: null,
        updated_at: postedIso,
      }).eq("id", post.id);

      return new Response(
        JSON.stringify({
          ok: true,
          post_id: post.id,
          caption,
          card_title: card.title,
          instagram_media_id: mediaId,
          instagram_permalink: permalink,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (pubErr) {
      const msg = pubErr instanceof Error ? pubErr.message : String(pubErr);
      await supabase.from("social_posts").update({
        status: "failed",
        publish_error: msg.slice(0, 900),
        updated_at: new Date().toISOString(),
      }).eq("id", post.id);

      return new Response(
        JSON.stringify({ ok: false, post_id: post.id, error: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
