import type { createClient } from "@/lib/supabase/server";

type StorefrontSupabaseClient = ReturnType<typeof createClient>;

export type CustomerAddress = {
  id: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const ADDRESS_SELECT =
  "id, recipient_name, phone, line1, line2, city, state, postal_code, country, is_default";

type AddressRow = {
  id: string;
  recipient_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

function mapAddressRow(row: AddressRow): CustomerAddress {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
  };
}

// RLS (customer_addresses_select_self, migration 0015) already scopes this
// to exactly the caller's own rows — no customer/organization filter to
// apply here beyond what the authenticated session already grants.
export async function listCustomerAddresses(
  supabase: StorefrontSupabaseClient,
): Promise<CustomerAddress[]> {
  const { data } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_SELECT)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => mapAddressRow(row as unknown as AddressRow));
}

export async function getCustomerAddress(
  supabase: StorefrontSupabaseClient,
  addressId: string,
): Promise<CustomerAddress | null> {
  const { data } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_SELECT)
    .eq("id", addressId)
    .maybeSingle();

  return data ? mapAddressRow(data as unknown as AddressRow) : null;
}
