import { NextRequest, NextResponse } from "next/server";
import { handleRazorpayWebhookCore } from "@/lib/razorpay/webhook";

// This is a Route Handler, not a Server Action, because it must be a plain
// public HTTP endpoint Razorpay's servers can POST to directly with no
// Supabase session at all. Only the HTTP method handler Next.js expects
// (POST) is exported from this module — the reusable, independently
// testable webhook logic lives in lib/razorpay/webhook.ts.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const result = await handleRazorpayWebhookCore(rawBody, signature);
  return NextResponse.json(result.body, { status: result.status });
}
