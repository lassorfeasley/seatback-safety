import { corsHeaders } from "../_shared/cors.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const SYSTEM_PROMPT = `You are an expert at extracting purchase and transaction data from documents related to airline safety card collecting. You will receive one or more pages of a document (receipt, invoice, eBay listing, auction record, email confirmation, etc.).

Extract as much structured data as you can and return ONLY valid JSON with this structure (use null for any field you cannot determine):

{
  "document_type": "receipt" | "invoice" | "listing" | "auction_record" | "email" | "shipping_label" | "other",
  "seller_name": "Seller username, person name, or business name" | null,
  "platform": "ebay" | "etsy" | "dealer" | "in_person" | "trade" | "gift" | "airline" | "other" | null,
  "listing_url": "Full URL of the listing if visible" | null,
  "price_paid_usd": 12.50 | null,
  "shipping_cost_usd": 4.95 | null,
  "transaction_date": "2024-03-15" | null,
  "delivery_date": "2024-03-20" | null,
  "item_description": "Brief description of the item(s) as written in the document" | null,
  "lot_size": 1 | null,
  "condition_notes": "Any condition info mentioned" | null,
  "order_number": "Platform order or transaction number" | null,
  "currency": "GBP" | "EUR" | "USD" | null,
  "price_original": 99.95 | null,
  "confidence": "high" | "medium" | "low"
}

Guidelines:
- For prices, extract the USD amount when available. If the document shows a non-USD currency alongside a USD equivalent (common on eBay international orders), use the USD amount for price_paid_usd. Also extract the original currency code into "currency" and the original price into "price_original" (e.g. if it says "GBP 99.95" and "$135.76", set price_paid_usd=135.76, currency="GBP", price_original=99.95).
- shipping_cost_usd: extract shipping cost in USD. On eBay, this is often listed separately. If listed in a foreign currency with no USD equivalent, extract the numeric value.
- order_number: look for "Order number", "Order #", "Transaction ID", "Item number" — capture the primary order/transaction identifier.
- transaction_date should be ISO 8601 format (YYYY-MM-DD). This is the ORDER/PURCHASE date — when the buyer placed the order or made payment. Look for "Order date", "Purchase date", "Payment date". Parse dates like "Apr 26, 2026" into "2026-04-26".
- delivery_date should be ISO 8601 format (YYYY-MM-DD). This is when the item was DELIVERED or received. Look for "Delivered", "Delivery date", "Estimated delivery", "Arrival date". On eBay, look for delivery confirmation dates. If only an estimated delivery window is shown (e.g. "May 1-8"), use the end date. If no delivery info is found, set to null.
- For eBay documents, the seller_name is the seller's username (e.g. "boacmarque"), NOT "eBay" itself. Platform should be "ebay". Look for "Sold by" to find the seller username.
- lot_size: if the document mentions multiple safety cards in one purchase, set this to the count. If it's clearly a single card, set to 1. If unclear, set to null.
- item_description: capture the item title or description as it appears in the document, not your interpretation.
- confidence: "high" if the document clearly shows transaction details, "medium" if some fields required interpretation, "low" if the document is unclear or you're uncertain about key fields.
- Only include information you can actually see in the document. Do not fabricate details.`;

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
    const { base64Pages, pdfBase64, pdfMediaType } = await req.json() as {
      base64Pages?: Array<{ data: string; mediaType: string }>;
      pdfBase64?: string;
      pdfMediaType?: string;
    };

    const content: Array<Record<string, unknown>> = [];

    if (pdfBase64) {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: pdfMediaType || "application/pdf",
          data: pdfBase64,
        },
      });
    } else if (base64Pages && base64Pages.length > 0) {
      for (const page of base64Pages.slice(0, 10)) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: page.mediaType, data: page.data },
        });
      }
    } else {
      return new Response(
        JSON.stringify({ error: "No document data provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    content.push({
      type: "text",
      text: "Analyze this document and extract transaction/purchase details as specified.",
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
      JSON.stringify({ extraction: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
