import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const META_APP_ID = Deno.env.get("META_APP_ID");
const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
const META_ACCESS_TOKEN_FALLBACK = Deno.env.get("META_ACCESS_TOKEN");
const META_GRAPH_API_VERSION = Deno.env.get("META_GRAPH_API_VERSION") ?? "v21.0";

// Instagram Login tokens (IGAA…/IGQ…) refresh via graph.instagram.com and need
// no app secret. Facebook Login tokens (EAA…) refresh via fb_exchange_token.
function isInstagramLoginToken(token: string): boolean {
  return token.startsWith("IG");
}

function sanitizeError(err: unknown, maxLen = 900): string {
  let s = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
  // Never leak tokens into logs or the status table.
  s = s.replace(/access_token=[^&\s"]+/gi, "access_token=REDACTED");
  if (s.length > maxLen) s = s.slice(0, maxLen) + "…";
  return s;
}

function isServiceCaller(req: Request): boolean {
  const raw = req.headers.get("Authorization") ?? "";
  const bearer = raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!bearer) return false;
  if (bearer === SUPABASE_SERVICE_ROLE_KEY) return true;
  // Gateway already verified JWT signatures; trust the role claim to handle
  // key format mismatches between Vault and env var (same as publish-instagram).
  try {
    const parts = bearer.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === "service_role") return true;
    }
  } catch { /* not a decodable JWT */ }
  return false;
}

interface GraphErrorBody {
  error?: { message?: string; code?: number };
}

async function graphJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const json = (await res.json()) as Record<string, unknown> & GraphErrorBody;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Graph API HTTP ${res.status}`);
  }
  return json;
}

async function refreshToken(currentToken: string): Promise<{ token: string; expiresIn: number | null }> {
  let json: Record<string, unknown>;
  if (isInstagramLoginToken(currentToken)) {
    const qs = new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: currentToken,
    });
    json = await graphJson(`https://graph.instagram.com/refresh_access_token?${qs.toString()}`);
  } else {
    if (!META_APP_ID || !META_APP_SECRET) {
      throw new Error("META_APP_ID or META_APP_SECRET not configured (required for Facebook Login tokens)");
    }
    const qs = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: currentToken,
    });
    json = await graphJson(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token?${qs.toString()}`);
  }
  const token = json.access_token as string | undefined;
  if (!token) throw new Error("Token refresh returned no access_token");
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;
  return { token, expiresIn };
}

async function validateToken(token: string): Promise<void> {
  const base = isInstagramLoginToken(token)
    ? `https://graph.instagram.com/${META_GRAPH_API_VERSION}`
    : `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
  await graphJson(`${base}/me?fields=id&access_token=${encodeURIComponent(token)}`);
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

  if (!isServiceCaller(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const recordStatus = async (fields: Record<string, unknown>) => {
    await supabase.from("meta_token_status").update({
      ...fields,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
  };

  try {
    let currentToken: string | null = null;
    const { data: vaultToken } = await supabase.rpc("get_meta_access_token");
    if (typeof vaultToken === "string" && vaultToken.length > 0) {
      currentToken = vaultToken;
    } else if (META_ACCESS_TOKEN_FALLBACK) {
      currentToken = META_ACCESS_TOKEN_FALLBACK;
    }
    if (!currentToken) {
      throw new Error(
        "No current token found. Seed one with: select public.set_meta_access_token('<token>');",
      );
    }

    let newToken: string;
    let expiresIn: number | null;
    try {
      ({ token: newToken, expiresIn } = await refreshToken(currentToken));
    } catch (refreshErr) {
      // Instagram Login tokens can't be refreshed within 24h of issuance.
      // If the current token still validates, that's not a failure state.
      await validateToken(currentToken).catch(() => {
        throw refreshErr;
      });
      await recordStatus({ last_error: null });
      return new Response(
        JSON.stringify({
          ok: true,
          refreshed: false,
          note: `Refresh not possible yet (${sanitizeError(refreshErr, 200)}), but current token is valid. Next weekly run will refresh it.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await validateToken(newToken);

    const { error: setErr } = await supabase.rpc("set_meta_access_token", { new_token: newToken });
    if (setErr) throw new Error(`Failed to store refreshed token: ${setErr.message}`);

    const nowIso = new Date().toISOString();
    // Meta omits expires_in for tokens that don't expire; assume 60 days otherwise.
    const expiresAt = new Date(Date.now() + (expiresIn ?? 60 * 24 * 3600) * 1000).toISOString();
    await recordStatus({ refreshed_at: nowIso, expires_at: expiresAt, last_error: null });

    return new Response(
      JSON.stringify({ ok: true, refreshed: true, refreshed_at: nowIso, expires_at: expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = sanitizeError(e);
    await recordStatus({ last_error: msg });
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
