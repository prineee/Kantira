"use client";

import { useState, useTransition } from "react";
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
  recordShipmentResult,
  markShipmentDelivered,
} from "./actions";

type Shipment = {
  id: string;
  status: string;
  provider: string;
  provider_shipment_id: string | null;
  last_error: string | null;
} | null;

// One panel per order/shipment state. Every branch mirrors exactly one
// transition advance_online_order_status/create_shipment_pending/
// record_shipment_result (0026) actually allows — there is no client-side
// state machine here, only a rendering of the DB's own gates. A rejected
// transition (wrong role, no store access) surfaces the RPC's own error
// text rather than being pre-validated in the browser.
export function OrderActions({
  orderId,
  status,
  hasStore,
  shipment,
  stores,
}: {
  orderId: string;
  status: string;
  hasStore: boolean;
  shipment: Shipment;
  stores: { id: string; store_code: string; store_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [showResultForm, setShowResultForm] = useState(false);
  const [awb, setAwb] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierId, setCourierId] = useState("");
  const [providerOrderId, setProviderOrderId] = useState("");
  const [providerShipmentId, setProviderShipmentId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function run(action: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

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
            onClick={() => run(() => createShipment(orderId))}
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending ? "Starting…" : shipment ? "Retry shipment" : "Create shipment"}
          </button>
          {error ? <p className={errorTextClass}>{error}</p> : null}
        </div>
      );
    }

    if (shipment.status === "PENDING") {
      return (
        <div className="space-y-3">
          <p className="text-sm text-brand-slate">
            Shipment record created. Book it with the courier outside KANTIRA, then record the
            result here.
          </p>
          {!showResultForm ? (
            <button
              type="button"
              onClick={() => setShowResultForm(true)}
              className={secondaryButtonClass}
            >
              Record shipment result
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
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
                <input
                  value={courierId}
                  onChange={(e) => setCourierId(e.target.value)}
                  className={inputClass}
                />
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
                      recordShipmentResult(shipment.id, orderId, true, {
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
                  className={primaryButtonClass}
                >
                  {pending ? "Saving…" : "Shipment booked successfully"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      recordShipmentResult(shipment.id, orderId, false, {
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
                  {pending ? "Saving…" : "Booking failed"}
                </button>
              </div>
            </div>
          )}
          {error ? <p className={errorTextClass}>{error}</p> : null}
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
