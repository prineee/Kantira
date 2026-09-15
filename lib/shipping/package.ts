// Server-only. Validates STAFF-ENTERED actual packed-parcel data (weight
// off a real scale, dimensions off the real box/bag) before it is ever
// persisted to shipments or sent to Shiprocket. Deliberately independent
// of weight.ts: that file computes an ESTIMATE from catalog data before a
// parcel exists (checkout-time shipping quote); this file validates the
// ACTUAL, staff-confirmed figures captured after packing. Neither replaces
// the other. Never invents a value — every field must be explicitly,
// validly provided, exactly like calculateTotalShipmentWeightKg() never
// substitutes a default for a missing items.weight_kg.

export type PackageDataInput = {
  deadWeightKg: unknown;
  lengthCm: unknown;
  breadthCm: unknown;
  heightCm: unknown;
};

export type PackageData = {
  deadWeightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
};

export type PackageDataResult = { ok: true; data: PackageData } | { ok: false; reason: string };

// Sanity ceilings against fat-fingered data entry (e.g. typing 1000 instead
// of 10.0) — NOT a verified Shiprocket or KANTIRA business limit. No such
// limit is documented anywhere in this codebase's Shiprocket research to
// date (see lib/shiprocket/types.ts's own header on what has vs. hasn't
// been live-verified). These numbers are deliberately generous — well
// beyond any real single-parcel institutional-apparel shipment — so they
// only catch obvious typos, never reject a genuine large-but-real order.
// Revisit once/if a real courier-imposed maximum is confirmed live.
export const MAX_PACKAGE_WEIGHT_KG = 100;
export const MAX_PACKAGE_DIMENSION_CM = 300;

function parseRequiredPositive(
  value: unknown,
  label: string,
  max: number,
  unit: string,
): { ok: true; value: number } | { ok: false; reason: string } {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: `${label} is required.` };
  }

  const n = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(n)) {
    // Number.isFinite(NaN) and Number.isFinite(Infinity) are both false —
    // this single check rejects NaN, +Infinity, and -Infinity together.
    return { ok: false, reason: `${label} must be a valid number.` };
  }

  if (n <= 0) {
    return { ok: false, reason: `${label} must be greater than zero.` };
  }

  if (n > max) {
    return {
      ok: false,
      reason: `${label} of ${n}${unit} looks like a data-entry error (expected under ${max}${unit}).`,
    };
  }

  return { ok: true, value: n };
}

export function validatePackageData(input: PackageDataInput): PackageDataResult {
  const weight = parseRequiredPositive(input.deadWeightKg, "Dead weight", MAX_PACKAGE_WEIGHT_KG, "kg");
  if (!weight.ok) return { ok: false, reason: weight.reason };

  const length = parseRequiredPositive(input.lengthCm, "Length", MAX_PACKAGE_DIMENSION_CM, "cm");
  if (!length.ok) return { ok: false, reason: length.reason };

  const breadth = parseRequiredPositive(input.breadthCm, "Breadth", MAX_PACKAGE_DIMENSION_CM, "cm");
  if (!breadth.ok) return { ok: false, reason: breadth.reason };

  const height = parseRequiredPositive(input.heightCm, "Height", MAX_PACKAGE_DIMENSION_CM, "cm");
  if (!height.ok) return { ok: false, reason: height.reason };

  return {
    ok: true,
    data: {
      deadWeightKg: weight.value,
      lengthCm: length.value,
      breadthCm: breadth.value,
      heightCm: height.value,
    },
  };
}
