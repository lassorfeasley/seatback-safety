import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const META_ACCESS_TOKEN_ENV = Deno.env.get("META_ACCESS_TOKEN");
const INSTAGRAM_BUSINESS_ACCOUNT_ID = Deno.env.get("INSTAGRAM_BUSINESS_ACCOUNT_ID");
const META_GRAPH_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") ?? "v21.0";

// Resolved per request: Vault (kept fresh by refresh-meta-token) wins over
// the static env secret.
let metaAccessToken: string | null = null;

// Instagram Login tokens (IGAA…/IGQ…) use graph.instagram.com; Facebook Login
// tokens (EAA…) use graph.facebook.com. Both share the same publishing endpoints.
function graphBase(): string {
  return metaAccessToken?.startsWith("IG")
    ? "https://graph.instagram.com"
    : "https://graph.facebook.com";
}

async function resolveMetaToken(supabase: any): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("get_meta_access_token");
    if (typeof data === "string" && data.length > 0) return data;
  } catch { /* vault accessor missing or unreadable — fall back to env */ }
  return META_ACCESS_TOKEN_ENV ?? null;
}

async function resolveIgAccountId(): Promise<string> {
  if (metaAccessToken?.startsWith("IG")) {
    // Instagram Login tokens are scoped to one account; ask Meta for its id.
    const json = await graphGet("me", { fields: "user_id,id" });
    const igId = (json.user_id as string) ?? (json.id as string);
    if (igId) return String(igId);
  }
  if (INSTAGRAM_BUSINESS_ACCOUNT_ID) return INSTAGRAM_BUSINESS_ACCOUNT_ID;
  throw new Error("Could not resolve Instagram account id");
}

const IG_CAPTION_MAX = 2200;
const DUE_BATCH_LIMIT = 5;

function derivativePublicUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/derivatives/${filePath}`;
}

function sanitizeError(err: unknown, maxLen = 900): string {
  let s = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
  return s;
}

type Caller = "service" | "user" | null;

async function verifyCaller(req: Request): Promise<Caller> {
  const raw = req.headers.get("Authorization") ?? "";
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const bearer = m?.[1]?.trim() ?? "";
  if (!bearer) return null;
  if (bearer === SUPABASE_SERVICE_ROLE_KEY) return "service";
  // Fallback: the gateway already verified the JWT signature, so trust the
  // role claim. This handles key format mismatches between Vault and env var.
  try {
    const parts = bearer.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === "service_role") return "service";
    }
  } catch { /* not a decodable JWT */ }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  return user ? "user" : null;
}

interface SocialPostRow {
  id: string;
  card_id: string;
  panel_id: string;
  crop_x_pct: number;
  crop_y_pct: number;
  crop_size_pct: number;
  crop_image_path: string | null;
  caption: string | null;
  status: string;
  scheduled_at: string | null;
  posted_at: string | null;
  instagram_media_id: string | null;
}

interface PanelImageRow {
  variant: string;
  file_path: string;
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function graphFormPost(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params);
  const url = `${graphBase()}/${META_GRAPH_API_VERSION}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as Record<string, unknown> & GraphErrorBody;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `Graph API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function graphGet(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...query, access_token: metaAccessToken! });
  const url = `${graphBase()}/${META_GRAPH_API_VERSION}/${path}?${qs.toString()}`;
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown> & GraphErrorBody;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? `Graph API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

async function waitForMediaContainer(creationId: string): Promise<void> {
  for (let i = 0; i < 45; i++) {
    const json = await graphGet(creationId, { fields: "status_code" });
    const code = json.status_code as string | undefined;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram container status: ${code}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Timeout waiting for Instagram media container");
}

async function publishToInstagram(imageUrl: string, caption: string): Promise<{ mediaId: string; permalink: string | null }> {
  const igId = await resolveIgAccountId();
  const token = metaAccessToken!;

  const createJson = await graphFormPost(`${igId}/media`, {
    image_url: imageUrl,
    caption: caption.slice(0, IG_CAPTION_MAX),
    access_token: token,
  });
  const creationId = createJson.id as string;
  if (!creationId) throw new Error("Instagram media create returned no id");

  await waitForMediaContainer(creationId);

  const publishJson = await graphFormPost(`${igId}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  const mediaId = publishJson.id as string;
  if (!mediaId) throw new Error("Instagram media_publish returned no id");

  let permalink: string | null = null;
  try {
    const info = await graphGet(mediaId, { fields: "permalink,shortcode" });
    permalink = (info.permalink as string) ?? null;
  } catch {
    /* optional */
  }
  return { mediaId, permalink };
}

function panelFilePathFromCard(card: Record<string, unknown>, panelId: string): string | null {
  const sides = (card.card_sides as Array<Record<string, unknown>>) ?? [];
  for (const side of sides) {
    const panels = (side.card_panels as Array<Record<string, unknown>>) ?? [];
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) continue;
    const images = (panel.panel_images as PanelImageRow[]) ?? [];
    const display = images.find((i) => i.variant === "display") ?? images.find((i) => i.variant === "full");
    if (display?.file_path) return display.file_path;
  }
  return null;
}

async function resolveImageUrlForPublish(
  _supabase: any,
  post: SocialPostRow,
  card: Record<string, unknown> | null,
): Promise<string> {
  if (post.crop_image_path && post.crop_image_path.length > 0) {
    return derivativePublicUrl(post.crop_image_path);
  }
  if (!card) throw new Error("Post has no crop_image_path and card data is missing");
  const panelPath = panelFilePathFromCard(card, post.panel_id);
  if (!panelPath) throw new Error("No panel image found for this post");
  return derivativePublicUrl(panelPath);
}

async function fetchPost(
  supabase: any,
  postId: string,
): Promise<{ post: SocialPostRow; card: Record<string, unknown> | null } | null> {
  const { data, error } = await supabase
    .from("social_posts")
    .select(`
      id,
      card_id,
      panel_id,
      crop_x_pct,
      crop_y_pct,
      crop_size_pct,
      crop_image_path,
      caption,
      status,
      scheduled_at,
      posted_at,
      instagram_media_id,
      safety_cards(
        card_sides(
          card_panels(
            id,
            panel_images(variant, file_path)
          )
        )
      )
    `)
    .eq("id", postId)
    .single();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const card = row.safety_cards as Record<string, unknown> | null;
  const post: SocialPostRow = {
    id: row.id as string,
    card_id: row.card_id as string,
    panel_id: row.panel_id as string,
    crop_x_pct: Number(row.crop_x_pct),
    crop_y_pct: Number(row.crop_y_pct),
    crop_size_pct: Number(row.crop_size_pct),
    crop_image_path: row.crop_image_path as string | null,
    caption: row.caption as string | null,
    status: row.status as string,
    scheduled_at: row.scheduled_at as string | null,
    posted_at: row.posted_at as string | null,
    instagram_media_id: row.instagram_media_id as string | null,
  };
  return { post, card };
}

async function publishOne(
  supabase: any,
  postId: string,
  options: { allowedStatuses: Set<string>; requireDueTime?: boolean },
): Promise<{ ok: true; mediaId: string; permalink: string | null } | { ok: false; error: string }> {
  const loaded = await fetchPost(supabase, postId);
  if (!loaded) return { ok: false, error: "Post not found" };
  const { post, card } = loaded;

  if (post.status === "posted" && post.instagram_media_id) {
    return { ok: false, error: "Post is already published to Instagram" };
  }
  if (!options.allowedStatuses.has(post.status)) {
    return { ok: false, error: `Post status "${post.status}" cannot be published in this context` };
  }
  if (options.requireDueTime) {
    if (!post.scheduled_at) return { ok: false, error: "Scheduled post has no scheduled_at" };
    const due = new Date(post.scheduled_at).getTime() <= Date.now();
    if (!due) return { ok: false, error: "Post is not due yet" };
  }

  const caption = (post.caption ?? "").trim();
  if (!caption) return { ok: false, error: "Caption is required to publish" };

  const nowIso = new Date().toISOString();
  await supabase.from("social_posts").update({
    publish_attempted_at: nowIso,
    publish_error: null,
    updated_at: nowIso,
  }).eq("id", postId);

  try {
    if (!metaAccessToken) {
      throw new Error("Meta access token not configured (Vault 'meta_access_token' or META_ACCESS_TOKEN secret)");
    }
    const imageUrl = await resolveImageUrlForPublish(supabase, post, card);
    const { mediaId, permalink } = await publishToInstagram(imageUrl, caption);
    const postedIso = new Date().toISOString();

    const { error: upErr } = await supabase.from("social_posts").update({
      status: "posted",
      posted_at: postedIso,
      instagram_media_id: mediaId,
      instagram_permalink: permalink,
      publish_error: null,
      updated_at: postedIso,
    }).eq("id", postId);

    if (upErr) throw new Error(upErr.message);
    return { ok: true, mediaId, permalink };
  } catch (e) {
    const msg = sanitizeError(e);
    await supabase.from("social_posts").update({
      status: "failed",
      publish_error: msg,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const caller = await verifyCaller(req);
  if (!caller) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      /* empty */
    }
  }

  const mode = body.mode as string | undefined;
  const postId = body.post_id as string | undefined;

  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    metaAccessToken = await resolveMetaToken(supabase);

    if (mode === "due") {
      if (caller !== "service") {
        return new Response(
          JSON.stringify({ error: "Forbidden", detail: "mode=due requires service role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const nowIso = new Date().toISOString();
      const { data: dueRows, error: dueErr } = await supabase
        .from("social_posts")
        .select("id")
        .eq("status", "scheduled")
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(DUE_BATCH_LIMIT);

      if (dueErr) {
        return new Response(
          JSON.stringify({ error: "Failed to list due posts", detail: dueErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const results: Array<{ id: string; ok: boolean; error?: string; mediaId?: string }> = [];
      for (const row of dueRows ?? []) {
        const id = (row as { id: string }).id;
        const r = await publishOne(supabase, id, {
          allowedStatuses: new Set(["scheduled"]),
          requireDueTime: true,
        });
        if (r.ok) results.push({ id, ok: true, mediaId: r.mediaId });
        else results.push({ id, ok: false, error: r.error });
      }

      return new Response(
        JSON.stringify({ processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!postId || typeof postId !== "string") {
      return new Response(
        JSON.stringify({ error: "post_id required (or mode=due for service role)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const r = await publishOne(supabase, postId, {
      allowedStatuses: new Set(["draft", "scheduled", "failed"]),
      requireDueTime: false,
    });

    if (!r.ok) {
      return new Response(
        JSON.stringify({ error: r.error }),
        { status: r.error.includes("not found") ? 404 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        post_id: postId,
        instagram_media_id: r.mediaId,
        instagram_permalink: r.permalink,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: sanitizeError(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
