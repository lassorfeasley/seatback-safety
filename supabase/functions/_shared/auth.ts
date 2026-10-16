import { corsHeaders } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export type Caller = "service" | "admin" | null;

function bearerToken(req: Request): string {
  const raw = req.headers.get("Authorization") ?? "";
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

export function isServiceCaller(req: Request): boolean {
  const bearer = bearerToken(req);
  return !!bearer && !!SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY;
}

// Functions deployed with verify_jwt = false receive unverified tokens, so a
// user token only counts once PostgREST has validated it and the admin check passes.
export async function verifyCaller(req: Request): Promise<Caller> {
  if (isServiceCaller(req)) return "service";
  const bearer = bearerToken(req);
  if (!bearer || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "seatback" },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data, error } = await client.rpc("current_user_is_admin");
  return !error && data === true ? "admin" : null;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
