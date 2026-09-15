import { shiprocketPost, shiprocketGet } from "./client";
import { ShiprocketError } from "./errors";
import type {
  CreateOrderInput,
  CreateOrderResult,
  AssignAwbResult,
  OrderLookupResult,
} from "./types";

// Server-only. Never import from a Client Component.
//
// UNVERIFIED CONTRACT — see types.ts's header on this same boundary. Every
// function here calls a Shiprocket endpoint this repository has never
// actually exercised. Do not remove this warning until a real sandbox call
// (Phase 5A-2 Step 10, CTO-authorized) confirms the shapes below, and even
// then only for the fields that call actually observed.
//
// What IS held to the existing repo's standard regardless of that gap:
// every response is defensively parsed (no assumption a field exists
// without checking), every failure path returns a normalized result or
// throws ShiprocketError — never a fake success, never a swallowed
// exception, never a fabricated provider id.

function orderDateNow(): string {
  // Shiprocket's documented format: "YYYY-MM-DD HH:mm". Built from the
  // server's own clock (UTC) — Shiprocket's docs do not specify a timezone
  // and this has not been live-verified; flagged for Step 10.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

export async function createShiprocketOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const payload = {
    order_id: input.channelOrderId,
    order_date: input.orderDate || orderDateNow(),
    pickup_location: input.pickupLocationNickname,
    channel_id: "",
    billing_customer_name: input.billing.customerName,
    billing_last_name: input.billing.lastName,
    billing_address: input.billing.address,
    billing_address_2: input.billing.address2 ?? "",
    billing_city: input.billing.city,
    billing_pincode: input.billing.pincode,
    billing_state: input.billing.state,
    billing_country: input.billing.country,
    billing_email: input.billing.email,
    billing_phone: input.billing.phone,
    shipping_is_billing: true,
    order_items: input.lines.map((line) => ({
      name: line.name,
      sku: line.sku,
      units: line.units,
      selling_price: line.sellingPrice,
      discount: line.discount,
      tax: line.tax,
      hsn: line.hsn ?? "",
    })),
    payment_method: input.paymentMethod,
    sub_total: input.subTotal,
    length: input.lengthCm,
    breadth: input.breadthCm,
    height: input.heightCm,
    weight: input.weightKg,
  };

  let json: unknown;
  try {
    json = await shiprocketPost("/orders/create/adhoc", payload);
  } catch (err) {
    if (err instanceof ShiprocketError) throw err;
    throw new ShiprocketError("unknown", "Unexpected error calling Shiprocket order creation.", {
      cause: err,
    });
  }

  const body = json as {
    order_id?: number | string;
    shipment_id?: number | string;
    status?: string;
    awb_code?: string | null;
    courier_company_id?: number | string | null;
    message?: string;
    errors?: unknown;
  } | null;

  if (!body || body.order_id === undefined || body.shipment_id === undefined) {
    return {
      ok: false,
      reason:
        typeof body?.message === "string" && body.message
          ? body.message
          : "Shiprocket did not return an order/shipment id.",
    };
  }

  return {
    ok: true,
    providerOrderId: String(body.order_id),
    providerShipmentId: String(body.shipment_id),
    providerStatus: body.status ?? null,
    awbCode: body.awb_code || null,
    courierCompanyId:
      body.courier_company_id !== undefined &&
      body.courier_company_id !== null &&
      body.courier_company_id !== ""
        ? Number(body.courier_company_id)
        : null,
  };
}

export async function assignAwb(providerShipmentId: string): Promise<AssignAwbResult> {
  let json: unknown;
  try {
    json = await shiprocketPost("/courier/assign/awb", { shipment_id: providerShipmentId });
  } catch (err) {
    if (err instanceof ShiprocketError) throw err;
    throw new ShiprocketError("unknown", "Unexpected error calling Shiprocket AWB assignment.", {
      cause: err,
    });
  }

  const body = json as {
    awb_assign_status?: number;
    response?: {
      data?: {
        awb_code?: string;
        courier_company_id?: number | string;
        courier_name?: string;
      };
    };
    message?: string;
  } | null;

  const data = body?.response?.data;

  if (!data || !data.awb_code || data.courier_company_id === undefined) {
    return {
      ok: false,
      reason:
        typeof body?.message === "string" && body.message
          ? body.message
          : "Shiprocket did not return an AWB.",
    };
  }

  return {
    ok: true,
    awbCode: data.awb_code,
    courierCompanyId: Number(data.courier_company_id),
    courierName: data.courier_name ?? null,
  };
}

// Reconciliation lookup — the LEAST certain endpoint in this file. Public
// Shiprocket docs describe filtering the order-listing endpoint by
// channel order id; the exact query param name and response envelope have
// not been confirmed live.
//
// Three-way result, deliberately (see types.ts's OrderLookupResult header):
// a well-formed response body whose `data` array simply has no matching
// row is a genuine "not_found". A response whose shape cannot be
// recognized at all — `data` missing/not an array, or a matching row
// missing the `id` needed to trust it — is "unknown", NEVER collapsed into
// "not_found". The two must never be conflated: a false "not_found" can
// let a human retry into creating a second, real, duplicate Shiprocket
// order, which is a materially worse outcome than an "unknown" that just
// requires a manual check.
export async function getOrderByChannelId(channelOrderId: string): Promise<OrderLookupResult> {
  let json: unknown;
  try {
    json = await shiprocketGet(
      `/orders?channel_order_id=${encodeURIComponent(channelOrderId)}`,
    );
  } catch (err) {
    if (err instanceof ShiprocketError) throw err;
    throw new ShiprocketError("unknown", "Unexpected error looking up the Shiprocket order.", {
      cause: err,
    });
  }

  const body = json as {
    data?: Array<{
      id?: number | string;
      channel_order_id?: string;
      shipments?: { id?: number | string; awb?: string; status?: string; courier?: string }[];
      status?: string;
    }>;
  } | null;

  if (!body || !Array.isArray(body.data)) {
    return {
      status: "unknown",
      reason: "Shiprocket's order-lookup response did not contain the expected data array.",
    };
  }

  const match = body.data.find((row) => String(row.channel_order_id) === channelOrderId);

  if (!match) {
    return { status: "not_found" };
  }

  if (match.id === undefined) {
    return {
      status: "unknown",
      reason: "Shiprocket returned a matching order with no usable id.",
    };
  }

  const shipment = Array.isArray(match.shipments) ? match.shipments[0] : undefined;

  return {
    status: "found",
    providerOrderId: String(match.id),
    providerShipmentId: shipment?.id !== undefined ? String(shipment.id) : null,
    providerStatus: match.status ?? shipment?.status ?? null,
    awbCode: shipment?.awb || null,
    courierCompanyId: null,
    courierName: shipment?.courier ?? null,
  };
}
