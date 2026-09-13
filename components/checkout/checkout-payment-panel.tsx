"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createCheckoutSessionAction } from "@/app/checkout/snapshot-actions";
import { placeCodOrderAction } from "@/app/checkout/cod-actions";
import { startRazorpayPaymentAction, verifyRazorpayPaymentAction } from "@/app/checkout/razorpay-actions";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RAZORPAY_CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay Checkout.")));
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

// Every mutation this component triggers is a server round-trip
// (createCheckoutSessionAction re-derives price/shipping server-side;
// placeCodOrderAction / verifyRazorpayPaymentAction do the actual
// finalization) — this component only ever holds UI state (pending/error),
// never anything that gets trusted as a price or payment result.
export function CheckoutPaymentPanel({
  addressId,
  courierId,
  paymentMethod,
  idempotencyKey,
  disabled,
}: {
  addressId: string | null;
  courierId: string | null;
  paymentMethod: "COD" | "RAZORPAY";
  idempotencyKey: string;
  disabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePlaceOrder() {
    if (!addressId || !courierId) return;
    setError(null);

    startTransition(async () => {
      const sessionResult = await createCheckoutSessionAction({
        addressId,
        courierId,
        paymentMethod,
        idempotencyKey,
      });

      if (!sessionResult.ok) {
        setError(sessionResult.error);
        return;
      }

      if (paymentMethod === "COD") {
        const orderResult = await placeCodOrderAction(sessionResult.checkoutSessionId);
        if (!orderResult.ok) {
          setError(orderResult.error);
          return;
        }
        router.push(`/checkout/confirmation?order=${orderResult.orderId}`);
        return;
      }

      const paymentResult = await startRazorpayPaymentAction(sessionResult.checkoutSessionId);
      if (!paymentResult.ok) {
        setError(paymentResult.error);
        return;
      }

      try {
        await loadRazorpayScript();
      } catch {
        setError("Could not load the payment provider. Please try again.");
        return;
      }

      if (!window.Razorpay) {
        setError("Could not load the payment provider. Please try again.");
        return;
      }

      const razorpay = new window.Razorpay({
        key: paymentResult.keyId,
        amount: paymentResult.amountPaise,
        currency: paymentResult.currency,
        order_id: paymentResult.razorpayOrderId,
        name: "KANTIRA",
        // The browser callback below is a UX convenience only — the
        // customer's browser is untrusted for "payment succeeded" — see
        // verifyRazorpayPaymentAction's own comment. The webhook
        // (app/api/webhooks/razorpay/route.ts) independently confirms the
        // same payment even if this callback never fires.
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          startTransition(async () => {
            const verifyResult = await verifyRazorpayPaymentAction({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            if (!verifyResult.ok) {
              setError(verifyResult.error);
              return;
            }
            router.push(`/checkout/confirmation?order=${verifyResult.orderId}`);
          });
        },
        modal: {
          ondismiss: () => {
            setError("Payment was not completed.");
          },
        },
      });

      razorpay.open();
    });
  }

  return (
    <div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        onClick={handlePlaceOrder}
        disabled={disabled || isPending}
        className="flex w-full items-center justify-center gap-2 rounded-card bg-brand-royal px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#0f4fd6] disabled:cursor-not-allowed disabled:bg-kantira-navy-100 disabled:text-kantira-navy-400"
      >
        {isPending ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ShieldCheck size={16} />
        )}
        {paymentMethod === "COD" ? "Place order (Cash on Delivery)" : "Pay with Razorpay"}
      </button>
      {disabled ? (
        <p className="mt-2 text-xs text-brand-slate">
          Select a delivery address and shipping option to continue.
        </p>
      ) : null}
    </div>
  );
}
