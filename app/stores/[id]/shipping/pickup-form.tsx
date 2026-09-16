"use client";

import { useState, useTransition } from "react";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  errorTextClass,
  successTextClass,
} from "@/lib/ui/form-classes";
import { setStorePickupMapping } from "./actions";
import type { ShiprocketPickupLocation } from "@/lib/shiprocket/types";

export function PickupMappingForm({
  storeId,
  locations,
}: {
  storeId: string;
  locations: ShiprocketPickupLocation[];
}) {
  const [selected, setSelected] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function onSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await setStorePickupMapping(storeId, selected);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass} htmlFor="pickup-location">
          Pickup location
        </label>
        <select
          id="pickup-location"
          className={inputClass}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setSuccess(false);
          }}
        >
          <option value="">Select a pickup location…</option>
          {locations.map((loc) => (
            <option key={loc.id} value={String(loc.id)}>
              {loc.nickname} — {loc.city}, {loc.state} ({loc.pinCode})
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={pending || !selected}
        className={primaryButtonClass}
      >
        {pending ? "Saving…" : "Save mapping"}
      </button>
      {error ? <p className={errorTextClass}>{error}</p> : null}
      {success ? <p className={successTextClass}>Pickup location mapped successfully.</p> : null}
    </div>
  );
}
