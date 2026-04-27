import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

  try {
    // Step 1: Generate a simple_og post via suggest-social-post
    const generateRes = await fetch(`${SUPABASE_URL}/functions/v1/suggest-social-post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ mode: "simple_og", auto_publish: true }),
    });

    if (!generateRes.ok) {
      const errBody = await generateRes.text();
      return new Response(
        JSON.stringify({ error: "Failed to generate post", detail: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const generated = await generateRes.json();
    const postId = generated.post?.id;
    if (!postId) {
      return new Response(
        JSON.stringify({ error: "No post ID returned from generation", generated }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Publish to Instagram
    const publishRes = await fetch(`${SUPABASE_URL}/functions/v1/publish-instagram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ post_id: postId }),
    });

    const publishResult = await publishRes.json();

    return new Response(
      JSON.stringify({
        ok: publishRes.ok,
        post_id: postId,
        caption: generated.post?.caption,
        card_title: generated.card_title,
        airline_name: generated.airline_name,
        publish: publishResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
