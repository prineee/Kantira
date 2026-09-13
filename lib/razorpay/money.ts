// Razorpay's API always takes/returns amounts as an integer number of the
// currency's smallest unit (paise for INR), never a decimal rupee amount.
// KANTIRA's own numeric(14,2) columns store rupees with exactly 2 decimal
// places. This is the one, single place that conversion happens — no
// pricing/amount math is duplicated anywhere else in TypeScript (the
// authoritative rupee amount always comes from the database: the checkout
// snapshot's grand_total, itself derived from the same price/tax formula
// create_online_order() already uses).
//
// Converts via string manipulation rather than floating-point
// multiplication (`amountRupees * 100`) specifically to avoid drift like
// `19.99 * 100 === 1998.9999999999998` — numeric(14,2) values from
// Postgres always arrive as strings or numbers with at most 2 decimal
// digits, so parsing the decimal text directly is exact.
export function rupeesToPaise(amountRupees: number | string): number {
  const str = typeof amountRupees === "number" ? amountRupees.toFixed(2) : amountRupees.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(str);
  if (!match) {
    throw new RangeError(`Not a valid non-negative rupee amount: ${amountRupees}`);
  }
  const whole = Number.parseInt(match[1]!, 10);
  const fraction = (match[2] ?? "00").padEnd(2, "0");
  return whole * 100 + Number.parseInt(fraction, 10);
}

export function paiseToRupees(amountPaise: number): number {
  return Math.round(amountPaise) / 100;
}
