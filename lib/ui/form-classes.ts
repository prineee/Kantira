// Shared Tailwind class strings matching the login/dashboard visual language
// (app/login/page.tsx, app/dashboard/page.tsx), reused across Phase 2 forms.

export const inputClass =
  "w-full rounded-lg border border-kantira-navy-200 px-3 py-2 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal";

export const selectClass = inputClass;

export const textareaClass = `${inputClass} resize-y`;

export const labelClass =
  "mb-1 block text-sm font-medium text-kantira-navy-700";

export const checkboxClass =
  "h-4 w-4 rounded border-kantira-navy-300 text-brand-royal focus:ring-brand-royal";

export const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-card bg-brand-royal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f4fd6] disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-kantira-navy-200 px-4 py-2.5 text-sm font-medium text-kantira-navy-700 transition hover:bg-kantira-navy-50";

export const errorTextClass = "text-sm text-red-600";

export const successTextClass = "text-sm text-kantira-green-600";

export const cardClass =
  "rounded-card border border-kantira-navy-100 bg-white p-6 shadow-sm";

export const badgeActiveClass =
  "rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-medium text-brand-teal";

export const badgeInactiveClass =
  "rounded-full bg-kantira-navy-50 px-2.5 py-1 text-xs font-medium text-kantira-navy-400";

export const badgeWarningClass =
  "rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600";

// transaction_status badges (Phase 3+ documents: purchases, sales, returns).
export const badgeDraftClass =
  "rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-600";

export const badgePostedClass = badgeActiveClass;

export const badgeCancelledClass = badgeInactiveClass;

// Compact inline input for line-item editor tables.
export const tableInputClass =
  "w-full rounded-md border border-kantira-navy-200 px-2 py-1.5 text-sm focus:border-brand-royal focus:outline-none focus:ring-1 focus:ring-brand-royal";
