// Server-only. Derives total shipment weight from authoritative catalog
// data (items.weight_kg, migration 0019) and a quantity the caller
// supplies — never a client-supplied weight. Deliberately generic/
// Shiprocket-agnostic: this is a KANTIRA catalog concern, not a courier
// concern, so it does not live under lib/shiprocket/.
//
// Arithmetic is done in integer grams (items.weight_kg is NUMERIC(10,3),
// i.e. exact at 1-gram resolution — 0.001 kg = 1 gram, per the approved
// column spec) rather than by summing JS floating-point kg values directly,
// so repeated addition across many cart lines can never accumulate the
// classic 0.1 + 0.2 rounding drift. The single division back to kg happens
// once, at the very end.

export type WeightLineInput = {
  /** Authoritative items.weight_kg for this line's item — null means "not
   * configured yet", not zero. */
  weightKg: number | null;
  quantity: number;
};

export type WeightCalculationResult =
  | { ok: true; totalWeightKg: number }
  | { ok: false; reason: string };

const MISSING_WEIGHT_MESSAGE = "Shipping weight is not configured for one or more products.";

export function calculateTotalShipmentWeightKg(
  lines: WeightLineInput[],
): WeightCalculationResult {
  if (lines.length === 0) {
    return { ok: false, reason: "No items to weigh." };
  }

  let totalGrams = 0;

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return { ok: false, reason: "Invalid item quantity." };
    }

    if (line.weightKg === null || line.weightKg === undefined) {
      return { ok: false, reason: MISSING_WEIGHT_MESSAGE };
    }

    if (!Number.isFinite(line.weightKg) || line.weightKg <= 0) {
      // Covers both a genuinely negative/zero stored value (shouldn't exist
      // given the DB CHECK constraint, but never trust that alone) and any
      // non-numeric surprise from the query layer.
      return { ok: false, reason: MISSING_WEIGHT_MESSAGE };
    }

    const gramsPerUnit = Math.round(line.weightKg * 1000);
    totalGrams += gramsPerUnit * line.quantity;
  }

  return { ok: true, totalWeightKg: totalGrams / 1000 };
}
