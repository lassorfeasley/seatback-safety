import { corsHeaders } from "./cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export type Caller = "service" | "admin" | null;

function bearerToken(req: Request): string {
  const raw = req.headers.get("Authorization") ?? "";
  return raw.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
}

// Functions deployed with verify_jwt = false receive unverified tokens, so the
// role is only trusted after PostgREST has validated the token's signature.
export async function verifyCaller(req: Request): Promise<Caller> {
  const bearer = bearerToken(req);
  if (!bearer) return null;
  if (SUPABASE_SERVICE_ROLE_KEY && bearer === SUPABASE_SERVICE_ROLE_KEY) return "service";
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "seatback" },
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data, error } = await client.rpc("caller_access");
  if (error) return null;
  return data === "service" || data === "admin" ? data : null;
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
