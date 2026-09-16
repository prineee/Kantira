import { NextRequest, NextResponse } from "next/server";
import { handleShiprocketWebhookCore } from "@/lib/shiprocket/webhook";

// Shiprocket's tracking/shipment-status webhook. A Route Handler, not a
// Server Action, for the same reason app/api/webhooks/razorpay/route.ts is
// — Shiprocket's servers POST here directly with no Supabase session. Only
// the HTTP method handler Next.js expects (POST) is exported from this
// module — the reusable, independently testable webhook logic (including
// the UNVERIFIED CONTRACT notes on the auth header and payload shape) lives
// in lib/shiprocket/webhook.ts.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const headerValue = req.headers.get("x-api-key");
  const result = await handleShiprocketWebhookCore(rawBody, headerValue);
  return NextResponse.json(result.body, { status: result.status });
}
