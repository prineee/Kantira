"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  inputClass,
  labelClass,
  checkboxClass,
  primaryButtonClass,
  errorTextClass,
} from "@/lib/ui/form-classes";
import type { AddressActionResult } from "@/lib/actions/customer-addresses";
import type { CustomerAddress } from "@/lib/data/customer-address-queries";
import type { CustomerAddressFieldErrors } from "@/lib/data/customer-address";

// Shared create/edit form. The action itself (createAddressAction, or
// updateAddressAction already bound to an address id) is passed in by the
// page — this component never decides which mutation it's performing, it
// only owns the form's local pending/error state, matching this
// codebase's established client-component pattern for interactive forms
// (see components/cart/cart-row.tsx).
export function AddressForm({
  action,
  initial,
  redirectTo = "/account/addresses",
}: {
  action: (formData: FormData) => Promise<AddressActionResult>;
  initial?: CustomerAddress;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<CustomerAddressFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await action(formData);
      if (result.error) {
        setFormError(result.error);
        if ("fieldErrors" in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        return;
      }
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? <p className={errorTextClass}>{formError}</p> : null}

      <div>
        <label className={labelClass} htmlFor="recipientName">
          Full name
        </label>
        <input
          id="recipientName"
          name="recipientName"
          defaultValue={initial?.recipientName}
          className={inputClass}
          disabled={isPending}
        />
        {fieldErrors.recipientName ? (
          <p className={errorTextClass}>{fieldErrors.recipientName}</p>
        ) : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="phone">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initial?.phone}
          className={inputClass}
          disabled={isPending}
        />
        {fieldErrors.phone ? <p className={errorTextClass}>{fieldErrors.phone}</p> : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="line1">
          Address line 1
        </label>
        <input
          id="line1"
          name="line1"
          defaultValue={initial?.line1}
          className={inputClass}
          disabled={isPending}
        />
        {fieldErrors.line1 ? <p className={errorTextClass}>{fieldErrors.line1}</p> : null}
      </div>

      <div>
        <label className={labelClass} htmlFor="line2">
          Address line 2 (optional)
        </label>
        <input
          id="line2"
          name="line2"
          defaultValue={initial?.line2 ?? ""}
          className={inputClass}
          disabled={isPending}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="city">
            City
          </label>
          <input
            id="city"
            name="city"
            defaultValue={initial?.city}
            className={inputClass}
            disabled={isPending}
          />
          {fieldErrors.city ? <p className={errorTextClass}>{fieldErrors.city}</p> : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="state">
            State
          </label>
          <input
            id="state"
            name="state"
            defaultValue={initial?.state}
            className={inputClass}
            disabled={isPending}
          />
          {fieldErrors.state ? <p className={errorTextClass}>{fieldErrors.state}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="postalCode">
            PIN code
          </label>
          <input
            id="postalCode"
            name="postalCode"
            inputMode="numeric"
            defaultValue={initial?.postalCode}
            className={inputClass}
            disabled={isPending}
          />
          {fieldErrors.postalCode ? (
            <p className={errorTextClass}>{fieldErrors.postalCode}</p>
          ) : null}
        </div>
        <div>
          <label className={labelClass} htmlFor="country">
            Country
          </label>
          <input
            id="country"
            name="country"
            defaultValue={initial?.country ?? "IN"}
            className={inputClass}
            disabled={isPending}
          />
          {fieldErrors.country ? <p className={errorTextClass}>{fieldErrors.country}</p> : null}
          <p className="mt-1 text-xs text-brand-slate">Only India is supported today.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-kantira-navy-700">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={initial?.isDefault}
          className={checkboxClass}
          disabled={isPending}
        />
        Set as default address
      </label>

      <button type="submit" disabled={isPending} className={primaryButtonClass}>
        {isPending ? "Saving..." : "Save address"}
      </button>
    </form>
  );
}
