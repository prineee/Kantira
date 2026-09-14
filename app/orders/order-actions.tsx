"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import {
  primaryButtonClass,
  secondaryButtonClass,
  selectClass,
  inputClass,
  labelClass,
  errorTextClass,
} from "@/lib/ui/form-classes";
import {
  advanceOrderStatus,
  resolveStalledOrder,
  createShipment,
  reconcileShipmentAttempt,
  recordShipmentResult,
  markShipmentDelivered,
} from "./actions";

type Shipment = {
  id: string;
  status: string;
  provider: string;
  provider_shipment_id: string | null;
  last_error: string | null;
  attempt_count: number;
  last_tracking_status: string | null;
} | null;

// One panel per order/shipment state. Every branch mirrors exactly one
// transition advance_online_order_status/create_shipment_pending/
// mark_shipment_attempted/record_shipment_result/resolve_shipment_attempt_
// as_retryable (0026/0028) actually allows — there is no client-side state
// machine here, only a rendering of the DB's own gates. A rejected
// transition (wrong role, no store access) surfaces the RPC's own error
// text rather than being pre-validated in the browser.
//
// "Create shipment" below calls the REAL Shiprocket order-creation path
// (app/orders/actions.ts's createShipment) — it is not a form the staff
// fills in. The manual AWB/courier entry form further down is a distinct,
// clearly-labeled override for UAT/debugging only; it is never the default
// action and never presented as equivalent to a real provider response.
export function OrderActions({
  orderId,
  orderNumber,
  status,
  hasStore,
  shipment,
  stores,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  hasStore: boolean;
  shipment: Shipment;
  stores: { id: string; store_code: string; store_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [showManualOverride, setShowManualOverride] = useState(false);
  const [awb, setAwb] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierId, setCourierId] = useState("");
  const [providerOrderId, setProviderOrderId] = useState("");
  const [providerShipmentId, setProviderShipmentId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function runCreateShipment() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await createShipment(orderId);
      if (result.outcome === "error" || result.outcome === "failed") {
        setError(result.error);
      } else if (result.outcome === "uncertain") {
        setInfo(
          "Shiprocket did not respond before this request timed out. The outcome is unknown — use \"Check with Shiprocket\" below before retrying.",
        );
      }
    });
  }

  function runReconcile() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      if (!shipment) return;
      const result = await reconcileShipmentAttempt(shipment.id, orderId, orderNumber);
      if (result.outcome === "error") {
        setError(result.error);
      } else if (result.outcome === "found_created") {
        setInfo("Shiprocket confirms this shipment was created. Recorded.");
      } else {
        setInfo("Shiprocket has no record of this order. It is now safe to retry.");
      }
    });
  }

  const manualOverridePanel = (shipmentId: string) => (
    <div className="mt-3 border-t border-amber-200 pt-3">
      {!showManualOverride ? (
        <button
          type="button"
          onClick={() => setShowManualOverride(true)}
          className="text-xs font-medium text-amber-700 underline"
        >
          Manual override (UAT / debugging only)
        </button>
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
            <AlertTriangle size={14} />
            Bypasses real Shiprocket confirmation — not a production booking
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelClass}>AWB / tracking number</label>
              <input value={awb} onChange={(e) => setAwb(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Courier name</label>
              <input
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Courier ID</label>
              <input value={courierId} onChange={(e) => setCourierId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Provider order ID</label>
              <input
                value={providerOrderId}
                onChange={(e) => setProviderOrderId(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Provider shipment ID</label>
              <input
                value={providerShipmentId}
                onChange={(e) => setProviderShipmentId(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Failure reason (only if it failed)</label>
              <input
                value={errorMessage}
                onChange={(e) => setErrorMessage(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    recordShipmentResult(shipmentId, orderId, true, {
                      providerOrderId,
                      providerShipmentId,
                      awb,
                      courierId,
                      courierName,
                      errorMessage: "",
                    }),
                  )
                }
                disabled={pending || !providerShipmentId}
                className={secondaryButtonClass}
              >
                {pending ? "Saving…" : "Force mark created"}
              </button>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    recordShipmentResult(shipmentId, orderId, false, {
                      providerOrderId: "",
                      providerShipmentId: "",
                      awb: "",
                      courierId: "",
                      courierName: "",
                      errorMessage,
                    }),
                  )
                }
                disabled={pending}
                className={secondaryButtonClass}
              >
                {pending ? "Saving…" : "Force mark failed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (status === "PENDING") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => run(() => advanceOrderStatus(orderId, "CONFIRMED"))}
          disabled={pending}
          className={primaryButtonClass}
        >
          {pending ? "Confirming…" : "Confirm order"}
        </button>
        {error ? <p className={errorTextClass}>{error}</p> : null}
      </div>
    );
  }

  if (status === "CONFIRMED" && !hasStore) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-brand-slate">
          No fulfillment store could be auto-assigned. Pick one to reserve stock there and
          continue.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className={`${selectClass} w-56`}
          >
            <option value="">Select a store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.store_code} — {s.store_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => run(() => resolveStalledOrder(orderId, storeId))}
            disabled={pending || !storeId}
            className={primaryButtonClass}
          >
            {pending ? "Assigning…" : "Assign & continue"}
          </button>
        </div>
        {error ? <p className={errorTextClass}>{error}</p> : null}
      </div>
    );
  }

  if (status === "CONFIRMED" && hasStore) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => run(() => advanceOrderStatus(orderId, "PROCESSING"))}
          disabled={pending}
          className={primaryButtonClass}
        >
          {pending ? "Starting…" : "Start processing"}
        </button>
        {error ? <p className={errorTextClass}>{error}</p> : null}
      </div>
    );
  }

  if (status === "PROCESSING") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => run(() => advanceOrderStatus(orderId, "PACKED"))}
          disabled={pending}
          className={primaryButtonClass}
        >
          {pending ? "Marking…" : "Mark packed"}
        </button>
        {error ? <p className={errorTextClass}>{error}</p> : null}
      </div>
    );
  }

  if (status === "PACKED") {
    if (!shipment || shipment.status === "FAILED") {
      return (
        <div className="space-y-2">
          {shipment?.status === "FAILED" && shipment.last_error ? (
            <p className={errorTextClass}>Last attempt failed: {shipment.last_error}</p>
          ) : null}
          <button
            type="button"
            onClick={runCreateShipment}
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Contacting Shiprocket…" : shipment ? "Retry shipment" : "Create shipment"}
          </button>
          {error ? <p className={errorTextClass}>{error}</p> : null}
          {info ? <p className="text-sm text-brand-slate">{info}</p> : null}
          {shipment ? manualOverridePanel(shipment.id) : null}
        </div>
      );
    }

    if (shipment.status === "PENDING") {
      return (
        <div className="space-y-2">
          <button
            type="button"
            onClick={runCreateShipment}
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Contacting Shiprocket…" : "Create shipment"}
          </button>
          {error ? <p className={errorTextClass}>{error}</p> : null}
          {manualOverridePanel(shipment.id)}
        </div>
      );
    }

    if (shipment.status === "ATTEMPTED") {
      return (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
            <AlertTriangle size={16} />
            Reconciliation needed
          </div>
          <p className="text-sm text-brand-slate">
            A create request was sent to Shiprocket (attempt #{shipment.attempt_count}) but no
            definite result was recorded — check before retrying, to avoid creating a duplicate
            shipment.
          </p>
          <button
            type="button"
            onClick={runReconcile}
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Checking…" : "Check with Shiprocket"}
          </button>
          {error ? <p className={errorTextClass}>{error}</p> : null}
          {info ? <p className="text-sm text-kantira-navy-800">{info}</p> : null}
          {manualOverridePanel(shipment.id)}
        </div>
      );
    }
  }

  if (status === "SHIPPED" && shipment?.status === "CREATED") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() =>
            run(() =>
              markShipmentDelivered(
                orderId,
                shipment.provider,
                shipment.provider_shipment_id ?? "",
              ),
            )
          }
          disabled={pending || !shipment.provider_shipment_id}
          className={primaryButtonClass}
        >
          {pending ? "Saving…" : "Mark delivered"}
        </button>
        {error ? <p className={errorTextClass}>{error}</p> : null}
      </div>
    );
  }

  return null;
}
