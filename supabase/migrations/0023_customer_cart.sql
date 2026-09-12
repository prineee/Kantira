-- KANTIRA Business OS — Phase 4B: persistent customer cart
--
-- No cart/cart_items schema existed anywhere in 0001-0022 (confirmed by
-- inspection — 0009's own comment explicitly says customer identity
-- linkage was scoped to exclude "any online-order/cart table"). This adds
-- the smallest normalized schema the brief calls for: one cart per
-- customer, cart_items referencing the authoritative `items` row by id
-- only (no price/name/description copy — the customer-safe selling price
-- is always read live from `items` at display time, through the same
-- items_select_public/authenticated column-grant boundary Phase 4A
-- already established. No permanent price table, no service-role, no
-- change to any existing table/policy/migration.
--
-- Ownership model mirrors customer_addresses (0015) exactly: a customer
-- identity (`customers.auth_user_id = auth.uid()`), never `profiles`/
-- `current_org_id()`/`current_role()` — those only ever resolve for staff
-- and must never be used to establish a customer's identity (Phase 5
-- decision doc, section 2.2).

-- ============================================================
-- TABLE: carts — one persistent cart per customer
-- ============================================================

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Enforces "one active cart per customer" at the database level (not
  -- just application logic) — also what add_to_cart_item's
  -- `on conflict (customer_id)` upsert below relies on for atomicity.
  unique (customer_id)
);

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: cart_items — references the authoritative item by id only
-- ============================================================

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  cart_id uuid not null references public.carts (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete restrict,
  quantity integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "Reasonable upper bound" per the brief's quantity-validation section —
  -- enforced here so it holds even if application-level validation is ever
  -- bypassed or a future code path writes to this table directly.
  constraint cart_items_quantity_range check (quantity > 0 and quantity <= 9999),
  -- Prevents duplicate rows for the same product in the same cart (brief
  -- section 5) — add_to_cart_item's `on conflict (cart_id, item_id)`
  -- upsert below is what actually turns a repeat "Add to Cart" into a
  -- quantity increase rather than a second row.
  unique (cart_id, item_id)
);

create index cart_items_cart_id_idx on public.cart_items (cart_id);
create index cart_items_item_id_idx on public.cart_items (item_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY — self-owner only, same shape as
-- customer_addresses_*_self (0015). No staff policy is added: nothing in
-- this phase's brief asks for staff visibility into customer carts, and
-- adding one un-asked-for would be scope creep on a security-sensitive
-- table. No anon policy is added at all — unauthenticated sessions have no
-- customers row to match, so every USING/WITH CHECK below already
-- evaluates to false for them; the table also receives no anon grant
-- (see below), so an anonymous request fails closed at the grant layer
-- before RLS is even evaluated, exactly like items/product_media do for
-- the columns anon was never granted.
-- ============================================================

alter table public.carts enable row level security;

create policy carts_select_self on public.carts
  for select
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = carts.customer_id and c.auth_user_id = auth.uid()
    )
  );

create policy carts_insert_self on public.carts
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.customers c
      where c.id = carts.customer_id
        and c.auth_user_id = auth.uid()
        and c.organization_id = carts.organization_id
    )
  );

create policy carts_update_self on public.carts
  for update
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = carts.customer_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.customers c
      where c.id = carts.customer_id
        and c.auth_user_id = auth.uid()
        and c.organization_id = carts.organization_id
    )
  );

create policy carts_delete_self on public.carts
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.customers c
      where c.id = carts.customer_id and c.auth_user_id = auth.uid()
    )
  );

alter table public.cart_items enable row level security;

create policy cart_items_select_self on public.cart_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.carts ca
      join public.customers c on c.id = ca.customer_id
      where ca.id = cart_items.cart_id and c.auth_user_id = auth.uid()
    )
  );

create policy cart_items_insert_self on public.cart_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.carts ca
      join public.customers c on c.id = ca.customer_id
      where ca.id = cart_items.cart_id
        and c.auth_user_id = auth.uid()
        and c.organization_id = cart_items.organization_id
    )
  );

create policy cart_items_update_self on public.cart_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.carts ca
      join public.customers c on c.id = ca.customer_id
      where ca.id = cart_items.cart_id and c.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.carts ca
      join public.customers c on c.id = ca.customer_id
      where ca.id = cart_items.cart_id
        and c.auth_user_id = auth.uid()
        and c.organization_id = cart_items.organization_id
    )
  );

create policy cart_items_delete_self on public.cart_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.carts ca
      join public.customers c on c.id = ca.customer_id
      where ca.id = cart_items.cart_id and c.auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- GRANTS — authenticated only (no sensitive columns exist on either
-- table, so no column-level narrowing is needed here the way 0018/0021/
-- 0022 narrowed items/product_media). anon gets nothing: an unauthenticated
-- request is rejected at the grant layer, before RLS is even evaluated.
-- service_role grant matches every other table in this schema (Supabase's
-- own bootstrap convention, not something app code uses — no app/lib
-- source reads SUPABASE_SERVICE_ROLE_KEY, enforced by an existing repo-wide
-- test).
-- ============================================================

grant select, insert, update, delete on public.carts to authenticated;
grant select, insert, update, delete on public.cart_items to authenticated;
grant all on public.carts to service_role;
grant all on public.cart_items to service_role;

-- ============================================================
-- RPC: add_to_cart_item — the one genuinely atomic operation this phase
-- needs (find-or-create the customer's single cart, then upsert-with-
-- increment the cart_item), so it is the one place a SECURITY DEFINER
-- function is used. Everything else (quantity update, remove, clear,
-- read-with-subtotal) is a plain RLS-guarded table operation from
-- app/cart/actions.ts and needs no RPC.
--
-- Never trusts a client-supplied price, organization_id, or customer_id:
-- price is never accepted as a parameter at all (cart_items has no price
-- column — the authoritative selling_price is always read live from
-- `items` at display time), and organization_id/customer_id are both
-- derived server-side from auth.uid() -> customers, never taken from the
-- caller. Fails closed (raises, inserts nothing) if the caller has no
-- customer identity or the item isn't a customer-visible, active,
-- public-storefront item — the exact same visibility rule
-- items_select_public already enforces for browsing, re-implemented here
-- explicitly because a SECURITY DEFINER function bypasses RLS on tables
-- its owner can otherwise reach (same rationale as items_catalog_for_staff,
-- migration 0022).
-- ============================================================

create or replace function public.add_to_cart_item(
  p_item_id uuid,
  p_quantity integer default 1
)
returns table (
  out_cart_item_id uuid,
  out_cart_id uuid,
  out_item_id uuid,
  out_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_organization_id uuid;
  v_cart_id uuid;
  v_item_exists boolean;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 9999 then
    raise exception 'Invalid quantity' using errcode = '22023';
  end if;

  select c.id, c.organization_id
    into v_customer_id, v_organization_id
    from public.customers c
   where c.auth_user_id = auth.uid();

  if v_customer_id is null then
    raise exception 'No customer identity found for this session' using errcode = '42501';
  end if;

  select exists (
    select 1
      from public.items i
     where i.id = p_item_id
       and i.organization_id = v_organization_id
       and i.is_active = true
       and public.is_org_public_storefront(i.organization_id)
  ) into v_item_exists;

  if not v_item_exists then
    raise exception 'This product is not available' using errcode = '22023';
  end if;

  insert into public.carts (organization_id, customer_id)
  values (v_organization_id, v_customer_id)
  on conflict (customer_id) do update set updated_at = now()
  returning id into v_cart_id;

  return query
    insert into public.cart_items as ci (organization_id, cart_id, item_id, quantity)
    values (v_organization_id, v_cart_id, p_item_id, p_quantity)
    on conflict (cart_id, item_id) do update
      set quantity = least(ci.quantity + excluded.quantity, 9999),
          updated_at = now()
    returning ci.id, ci.cart_id, ci.item_id, ci.quantity;
end;
$$;

revoke all on function public.add_to_cart_item(uuid, integer) from public;
grant execute on function public.add_to_cart_item(uuid, integer) to authenticated;
