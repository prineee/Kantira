"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/actions/auth";
import type { Database } from "@/types/database";

type ActionState = { error: string | null };
type AccountType = Database["public"]["Enums"]["account_type"];
type ControlAccountType = Database["public"]["Enums"]["control_account_type"];

const WRITE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"] as const;
const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
const CONTROL_TYPES: ControlAccountType[] = ["NONE", "CUSTOMER", "SUPPLIER", "CASH", "BANK"];

// Mirrors the authoritative CHECK constraint on chart_of_accounts
// (0002_phase2_business_core.sql): ASSET/EXPENSE must be DEBIT-normal,
// LIABILITY/EQUITY/INCOME must be CREDIT-normal. Derived here rather than
// exposed as a free choice so the form can never submit an invalid pair.
function normalBalanceFor(accountType: AccountType): "DEBIT" | "CREDIT" {
  return accountType === "ASSET" || accountType === "EXPENSE" ? "DEBIT" : "CREDIT";
}

function readAccountFields(formData: FormData) {
  const account_code = String(formData.get("account_code") ?? "").trim();
  const account_name = String(formData.get("account_name") ?? "").trim();
  const account_type = String(formData.get("account_type") ?? "") as AccountType;
  const control_type = String(formData.get("control_type") ?? "NONE") as ControlAccountType;
  const parent_account_id = String(formData.get("parent_account_id") ?? "").trim();

  return { account_code, account_name, account_type, control_type, parent_account_id };
}

function validate(fields: ReturnType<typeof readAccountFields>): string | null {
  if (!fields.account_code) return "Account code is required.";
  if (!fields.account_name) return "Account name is required.";
  if (!ACCOUNT_TYPES.includes(fields.account_type)) return "A valid account type is required.";
  if (!CONTROL_TYPES.includes(fields.control_type)) return "Invalid control type.";
  return null;
}

export async function createAccount(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage the chart of accounts." };
  }

  const fields = readAccountFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("chart_of_accounts").insert({
    account_code: fields.account_code,
    account_name: fields.account_name,
    account_type: fields.account_type,
    normal_balance: normalBalanceFor(fields.account_type),
    control_type: fields.control_type,
    parent_account_id: fields.parent_account_id || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function updateAccount(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOrgContext();
  if (ctx.error) return { error: ctx.error };
  const { supabase, profile } = ctx;

  if (!WRITE_ROLES.includes(profile.role as (typeof WRITE_ROLES)[number])) {
    return { error: "You do not have permission to manage the chart of accounts." };
  }

  const fields = readAccountFields(formData);
  const validationError = validate(fields);
  if (validationError) return { error: validationError };

  const is_active = formData.get("is_active") === "on";

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({
      account_code: fields.account_code,
      account_name: fields.account_name,
      account_type: fields.account_type,
      normal_balance: normalBalanceFor(fields.account_type),
      control_type: fields.control_type,
      parent_account_id: fields.parent_account_id || null,
      is_active,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}/edit`);
  redirect("/accounts");
}
