"use client";

import { useId, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import { labelClass, tableInputClass, secondaryButtonClass } from "@/lib/ui/form-classes";

export type ItemOption = {
  id: string;
  sku: string;
  name: string;
  uomId: string;
  uomLabel: string;
  defaultRate: number;
  taxRatePercent: number;
};

export type LineRow = {
  key: string;
  itemId: string;
  uomId: string;
  uomLabel: string;
  itemLabel: string;
  quantity: number;
  rate: number;
  discountAmount: number;
  taxAmount: number;
  locked?: boolean;
  maxQuantity?: number;
  originalLineId?: string;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lineTotal(row: LineRow) {
  return round2(row.quantity * row.rate - row.discountAmount + row.taxAmount);
}

// Shared dynamic line-item table for purchases/sales (blank, addable rows)
// and purchase/sales returns (locked rows seeded from the original document
// — item/UOM/rate can't change, only the return quantity). Serializes to one
// hidden JSON field so a plain FormData server action can read a
// variable-length line array without extra plumbing.
export function LineItemsEditor({
  items,
  rateLabel,
  initialRows,
  fieldName = "lines",
}: {
  items: ItemOption[];
  rateLabel: string;
  initialRows?: LineRow[];
  fieldName?: string;
}) {
  const uid = useId();
  const [rows, setRows] = useState<LineRow[]>(
    initialRows && initialRows.length > 0
      ? initialRows
      : [
          {
            key: `${uid}-0`,
            itemId: "",
            uomId: "",
            uomLabel: "",
            itemLabel: "",
            quantity: 1,
            rate: 0,
            discountAmount: 0,
            taxAmount: 0,
          },
        ],
  );
  const locked = rows.some((r) => r.locked);

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function selectItem(key: string, itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      updateRow(key, { itemId: "", uomId: "", uomLabel: "", itemLabel: "", rate: 0, taxAmount: 0 });
      return;
    }
    const row = rows.find((r) => r.key === key);
    const quantity = row?.quantity ?? 1;
    updateRow(key, {
      itemId: item.id,
      uomId: item.uomId,
      uomLabel: item.uomLabel,
      itemLabel: `${item.sku} — ${item.name}`,
      rate: item.defaultRate,
      taxAmount: round2((quantity * item.defaultRate * item.taxRatePercent) / 100),
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: `${uid}-${prev.length}-${Date.now()}`,
        itemId: "",
        uomId: "",
        uomLabel: "",
        itemLabel: "",
        quantity: 1,
        rate: 0,
        discountAmount: 0,
        taxAmount: 0,
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  const subtotal = round2(rows.reduce((sum, r) => sum + lineTotal(r), 0));

  const payload = rows
    .filter((r) => r.itemId && r.quantity > 0)
    .map((r) => ({
      item_id: r.itemId,
      uom_id: r.uomId,
      quantity: r.quantity,
      rate: r.rate,
      discount_amount: r.discountAmount,
      tax_amount: r.taxAmount,
      original_line_id: r.originalLineId,
    }));

  return (
    <div>
      <input type="hidden" name={fieldName} value={JSON.stringify(payload)} readOnly />
      <div className="overflow-x-auto rounded-lg border border-kantira-navy-100">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-kantira-navy-100 bg-kantira-navy-50/50 text-xs uppercase tracking-wide text-brand-slate">
              <th className="py-2 px-3">Item</th>
              <th className="py-2 px-3">UOM</th>
              <th className="py-2 px-3 text-right">Qty</th>
              <th className="py-2 px-3 text-right">{rateLabel}</th>
              {!locked ? <th className="py-2 px-3 text-right">Discount</th> : null}
              {!locked ? <th className="py-2 px-3 text-right">Tax</th> : null}
              <th className="py-2 px-3 text-right">Line total</th>
              {!locked ? <th className="py-2 px-3" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-kantira-navy-50">
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 px-3">
                  {row.locked ? (
                    <span className="text-kantira-navy-800">{row.itemLabel}</span>
                  ) : (
                    <select
                      value={row.itemId}
                      onChange={(e) => selectItem(row.key, e.target.value)}
                      className={tableInputClass}
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} — {i.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="py-2 px-3 text-brand-slate">{row.uomLabel || "—"}</td>
                <td className="py-2 px-3">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    max={row.maxQuantity}
                    value={row.quantity}
                    onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                    className={`${tableInputClass} text-right`}
                  />
                  {row.maxQuantity !== undefined ? (
                    <p className="mt-0.5 text-xs text-brand-slate">max {row.maxQuantity}</p>
                  ) : null}
                </td>
                <td className="py-2 px-3">
                  {row.locked ? (
                    <span className="block text-right text-kantira-navy-800">
                      {row.rate.toFixed(4)}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={row.rate}
                      onChange={(e) => updateRow(row.key, { rate: Number(e.target.value) || 0 })}
                      className={`${tableInputClass} text-right`}
                    />
                  )}
                </td>
                {!locked ? (
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.discountAmount}
                      onChange={(e) =>
                        updateRow(row.key, { discountAmount: Number(e.target.value) || 0 })
                      }
                      className={`${tableInputClass} text-right`}
                    />
                  </td>
                ) : null}
                {!locked ? (
                  <td className="py-2 px-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.taxAmount}
                      onChange={(e) =>
                        updateRow(row.key, { taxAmount: Number(e.target.value) || 0 })
                      }
                      className={`${tableInputClass} text-right`}
                    />
                  </td>
                ) : null}
                <td className="py-2 px-3 text-right font-medium text-kantira-navy-900">
                  {lineTotal(row).toFixed(2)}
                </td>
                {!locked ? (
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      disabled={rows.length === 1}
                      className="text-red-500 disabled:opacity-30"
                      aria-label="Remove line"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {!locked ? (
          <button type="button" onClick={addRow} className={secondaryButtonClass}>
            <Plus size={15} />
            Add line
          </button>
        ) : (
          <span />
        )}
        <p className="text-sm text-kantira-navy-700">
          Lines subtotal: <span className="font-semibold">{subtotal.toFixed(2)}</span>
        </p>
      </div>
    </div>
  );
}
