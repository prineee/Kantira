import { NextRequest, NextResponse } from "next/server";
import { handleShiprocketWebhookCore } from "@/lib/shiprocket/webhook";

// Neutral public alias for the Shiprocket tracking/shipment-status webhook.
// Shiprocket's own webhook URL validation rejects URLs containing keywords
// like "shiprocket"/"sr"/"kr" (see app/api/webhooks/shiprocket/route.ts,
// left in place unchanged), so this route exists purely to give Shiprocket
// a URL it will accept. It reuses handleShiprocketWebhookCore() directly —
// same auth (x-api-key / SHIPROCKET_WEBHOOK_SECRET), payload parsing,
// idempotency, shipment event recording, and status-transition behavior,
// with zero duplicated business logic. Only the HTTP method handler Next.js
// expects (POST) is exported from this module.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const headerValue = req.headers.get("x-api-key");
  const result = await handleShiprocketWebhookCore(rawBody, headerValue);
  return NextResponse.json(result.body, { status: result.status });
}
