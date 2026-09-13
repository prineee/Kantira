-- KANTIRA Business OS — Phase 4D accounting correction.
--
-- CTO decision (accounting): COD -> CASH control account, RAZORPAY -> BANK
-- control account (both control_account_type values already exist — no new
-- type added). Accounting posts at order CONFIRMED time (COD: on customer
-- placement; RAZORPAY: on authoritative payment capture), never deferred to
-- physical fulfillment. A CONFIRMED order requires BOTH a successful
-- inventory reservation AND a successful accounting posting — either
-- failing rolls back the whole finalization.
--
-- migration 0024 has already been applied (pushed) to the linked project
-- and is NOT edited here — per the CTO's instruction, a historical,
-- already-applied migration is never rewritten in place. This migration
-- instead re-issues `create or replace function
-- public.finalize_checkout_session_internal(...)` with the accounting call
-- added, which is the normal, safe way Postgres functions evolve across
-- migrations (every earlier phase in this repo does the same thing to
-- `record_stock_movement`, `post_sale`, etc. across 0003/0004/0005).
--
-- WHY NEW FUNCTIONS INSTEAD OF REUSING post_sale()/record_stock_movement():
-- post_sale() (0004), record_stock_movement() (0005), get_control_account()
-- and get_role_account() (0003) all resolve their organization via
-- current_org_id()/current_role(), which read the STAFF `profiles` table
-- keyed by auth.uid(). A customer's auth.uid() has no `profiles` row, so
-- current_org_id() is NULL for every customer session — not an
-- authorization gate that can be satisfied by role-switching, a structural
-- dependency on staff identity in the primitives themselves. Calling these
-- functions from the customer checkout path would require either
-- fabricating a staff identity (explicitly forbidden) or weakening their
-- authorization (explicitly forbidden for post_sale(), and by the same
-- reasoning for its dependencies). Per the CTO's explicit direction, this
-- migration instead adds new, narrowly-scoped, explicit-org-id-parameter
-- functions — the exact same pattern reserve_all_lines_at_store() (0015)
-- already established for inventory (it takes p_order_id/p_store_id
-- explicitly and never calls current_org_id() at all, unlike the
-- staff-gated auto_allocate_online_order_store()). post_sale(),
-- record_stock_movement(), get_control_account(), and get_role_account()
-- are NOT modified by this migration — byte-for-byte unchanged, still the
-- only path staff-driven POS sales use.
--
-- These new functions reuse the EXACT SAME schema and formula post_sale()
-- uses — the same chart_of_accounts/account_role_map lookup shape, the
-- same journal_entries/journal_entry_lines double-entry pattern (Dr control
-- account / Cr revenue; Dr COGS / Cr Inventory), the same weighted-average
-- costing arithmetic record_stock_movement() uses for a SALE/OUT movement,
-- and the same `sales`/`sale_lines` tables (linked back via
-- `online_orders.sale_id`, a column 0015 already added for exactly this
-- purpose and has never been used until now). No new ledger, no new
-- control-account type, no new formula.
--
-- ATTRIBUTION: sales.created_by/posted_by, journal_entries.created_by, and
-- stock_movements.created_by are all FK'd to `profiles` (staff) — a
-- customer's auth.uid() cannot satisfy that FK, and there is no "system
-- actor" concept anywhere in this schema. These automated, ecommerce-
-- triggered rows are attributed to the organization's own OWNER profile
-- (deterministically resolved, guaranteed to exist by
-- create_organization_with_owner()'s own invariant) — a disclosed
-- simplification, not a claim that the owner personally acted, exactly as
-- financial systems commonly attribute system-initiated postings to a
-- designated account. This is an audit-attribution choice, not an
-- authorization decision: the actual authorization for this whole flow
-- already happened earlier via requireCustomerContext() / checkout_session
-- ownership checks.
--
-- SIMPLIFICATION DISCLOSED: no shipping-income ledger role exists in this
-- schema (ledger_account_role has only INVENTORY/SALES_REVENUE/COGS/
-- INVENTORY_LOSS). Online orders — unlike in-store POS sales, which have no
-- shipping concept — include a shipping_total. Rather than invent a new
-- account role (explicitly disallowed), the full online_orders.grand_total
-- (subtotal + tax + shipping, discount already always 0 in this phase) is
-- posted as SALES_REVENUE, matching post_sale()'s own "one control-account
-- debit balances one revenue-account credit" shape exactly. Flagged here
-- for the CTO to revisit if a dedicated shipping-income account is wanted
-- later; not a decision this migration invents on its own beyond what's
-- structurally unavoidable.
--
-- EQUIVALENCE AUDIT (post-review): compared line-by-line against
-- post_sale()/record_stock_movement()/get_control_account()/
-- get_role_account(). Two real gaps were found and fixed here (not
-- silently, not by touching the originals):
--   1. record_online_sale_stock_out() was missing the
--      store-belongs-to-org / item-belongs-to-org cross-check
--      record_stock_movement() performs for its own (much more widely
--      reachable) callers. Added, identical in shape.
--   2. post_online_order_accounting() was not writing
--      `sale_line_movements` the way post_sale() does — the table that
--      lets a future return (post_sales_return()-style) find the exact
--      historical cost again. Added: one row per line, matched by
--      (sale_id, item_id), unambiguous because checkout_session_lines is
--      unique per (checkout_session_id, item_id).
-- One intentional, disclosed divergence remains: post_sale() RE-COMPUTES
-- its subtotal/total from `sale_lines` at posting time (a safety
-- recomputation appropriate for a staff-editable DRAFT sale). This bridge
-- instead trusts `online_orders.subtotal/tax_total/grand_total` directly
-- — already frozen and rounded with the identical per-line formula at
-- `create_checkout_session()` time, with no staff-editable DRAFT step in
-- between for an online order. Same rounding rule, applied once upstream
-- instead of re-applied at posting, not a different formula.
-- Everything else (debit/credit shape, revenue treatment, COGS threshold
-- and formula, weighted-average costing, inventory credit, control-account
-- resolution rule, journal source_type/status semantics, org isolation)
-- matches exactly.
--
-- INVENTORY <-> ACCOUNTING INTERACTION: reserve_all_lines_at_store() only
-- reserves (stock_reservations, ACTIVE) — it does not move physical stock.
-- Since the CTO's decision requires COGS/Inventory to post at CONFIRMED
-- time (not fulfillment), the actual weighted-average stock OUT movement
-- (record_online_sale_stock_out(), below) now also happens at CONFIRMED
-- time, in the same transaction, immediately after reservation. Once
-- physical stock is moved, the corresponding ACTIVE reservation is
-- transitioned to CONSUMED (consumed_at = now()) — a status
-- stock_reservations has had since 0015 but never used until now — so the
-- existing "available = physical - ACTIVE reservations" view stays
-- arithmetically correct (physical drops by Q, ACTIVE-reserved drops by Q,
-- net available is unchanged by this transition). The advisory
-- transaction lock taken during reservation (assert_stock_available(),
-- inside reserve_all_lines_at_store()) is held for the rest of this same
-- transaction, so no concurrent transaction can have moved physical stock
-- in between — the OUT movement recorded here is guaranteed to succeed
-- whenever the reservation moments earlier just succeeded.

-- ============================================================
-- get_control_account_for_org / get_role_account_for_org — identical to
-- get_control_account()/get_role_account() (0003) except parameterized by
-- an explicit, already-validated organization_id instead of
-- current_org_id(). get_control_account()/get_role_account() themselves
-- are NOT modified.
-- ============================================================

create or replace function public.get_control_account_for_org(p_org_id uuid, p_control_type public.control_account_type)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result_id uuid;
  match_count int;
begin
  select id, count(*) over ()
    into result_id, match_count
    from public.chart_of_accounts
    where organization_id = p_org_id
      and control_type = p_control_type
      and is_active = true
    limit 1;

  if result_id is null then
    raise exception 'No active % control account configured for this organization', p_control_type;
  end if;

  if match_count > 1 then
    raise exception 'Multiple active % control accounts found; exactly one is required', p_control_type;
  end if;

  return result_id;
end;
$$;

revoke all on function public.get_control_account_for_org(uuid, public.control_account_type) from public;

create or replace function public.get_role_account_for_org(p_org_id uuid, p_role public.ledger_account_role)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result_id uuid;
begin
  select account_id into result_id
  from public.account_role_map
  where organization_id = p_org_id and role = p_role;

  if result_id is null then
    raise exception 'No % account configured for this organization (see account_role_map)', p_role;
  end if;

  return result_id;
end;
$$;

revoke all on function public.get_role_account_for_org(uuid, public.ledger_account_role) from public;

-- ============================================================
-- resolve_accounting_attribution_profile — the org's own earliest OWNER
-- profile, used only for the FK-required created_by/posted_by columns on
-- system-initiated ecommerce postings (see migration header). Guaranteed
-- to resolve: create_organization_with_owner() (0001) never creates an
-- organization without one.
-- ============================================================

create or replace function public.resolve_accounting_attribution_profile(p_org_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.profiles
  where organization_id = p_org_id and role = 'OWNER'::public.user_role
  order by created_at asc
  limit 1;
$$;

revoke all on function public.resolve_accounting_attribution_profile(uuid) from public;

-- ============================================================
-- record_online_sale_stock_out — the SALE/OUT/WEIGHTED_AVERAGE branch of
-- record_stock_movement() (0005), reproduced with an explicit organization
-- id/attribution profile instead of current_org_id()/auth.uid(), for the
-- exact reason explained in this migration's header.
-- record_stock_movement() itself is NOT modified.
-- ============================================================

create or replace function public.record_online_sale_stock_out(
  p_org_id uuid,
  p_store_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_reference text,
  p_transaction_date date,
  p_notes text,
  p_attributed_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  old_qty numeric(14, 3);
  old_total_value numeric(14, 2);
  resolved_unit_cost numeric(14, 4);
  movement_value numeric(14, 2);
  new_movement_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Movement quantity must be greater than zero';
  end if;

  -- Same organization-isolation cross-check record_stock_movement() (0005)
  -- performs for its own callers — this function's only caller already
  -- guarantees this, but the check is cheap and keeps this function safe
  -- independent of caller correctness, matching record_stock_movement()'s
  -- own defense-in-depth posture exactly.
  if not exists (
    select 1 from public.stores where id = p_store_id and organization_id = p_org_id
  ) then
    raise exception 'Store % not found in organization %', p_store_id, p_org_id;
  end if;

  if not exists (
    select 1 from public.items where id = p_item_id and organization_id = p_org_id
  ) then
    raise exception 'Item % not found in organization %', p_item_id, p_org_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(case when direction = 'IN' then quantity else -quantity end), 0)
    into old_qty
    from public.stock_movements
    where store_id = p_store_id and item_id = p_item_id;

  select total_value into old_total_value
    from public.item_store_costs
    where organization_id = p_org_id and store_id = p_store_id and item_id = p_item_id;
  old_total_value := coalesce(old_total_value, 0);

  if old_qty < p_quantity then
    raise exception 'Insufficient stock for item % at store %: available %, requested %',
      p_item_id, p_store_id, old_qty, p_quantity;
  end if;

  if old_qty > 0 then
    resolved_unit_cost := round(old_total_value / old_qty, 4);
  else
    resolved_unit_cost := 0;
  end if;

  movement_value := round(p_quantity * resolved_unit_cost, 2);
  if movement_value > old_total_value then
    movement_value := old_total_value;
  end if;

  insert into public.stock_movements (
    organization_id, store_id, item_id, movement_type, direction, quantity,
    reference, transaction_date, notes, created_by
  ) values (
    p_org_id, p_store_id, p_item_id, 'SALE', 'OUT', p_quantity,
    p_reference, p_transaction_date, p_notes, p_attributed_profile_id
  ) returning id into new_movement_id;

  insert into public.stock_movement_costs (
    movement_id, organization_id, unit_cost, total_cost, cost_basis
  ) values (
    new_movement_id, p_org_id, resolved_unit_cost, movement_value, 'WEIGHTED_AVERAGE'
  );

  insert into public.item_store_costs (organization_id, store_id, item_id, total_value)
  values (p_org_id, p_store_id, p_item_id, old_total_value - movement_value)
  on conflict (organization_id, store_id, item_id)
  do update set total_value = excluded.total_value, updated_at = now();

  return new_movement_id;
end;
$$;

revoke all on function public.record_online_sale_stock_out(
  uuid, uuid, uuid, numeric, text, date, text, uuid
) from public;

-- ============================================================
-- post_online_order_accounting — the online_order -> accounting bridge.
-- Not granted to any role: only reachable from
-- finalize_checkout_session_internal() below, which has already validated
-- everything about this order before calling here. Idempotent by
-- construction: the `for update` lock on online_orders plus the
-- sale_id-already-set short-circuit mean a duplicate/concurrent call for
-- the same order is a safe no-op (DB-level, not an application-level
-- "already exists" check) — and in practice this function is only ever
-- reached once per order at all, since finalize_checkout_session_internal's
-- own `for update` lock on checkout_sessions already serializes every
-- caller for the same checkout session before this point is ever reached.
-- ============================================================

create or replace function public.post_online_order_accounting(p_order_id uuid, p_payment_method text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_attributed_profile_id uuid;
  v_control_type public.control_account_type;
  v_debit_account_id uuid;
  v_revenue_account_id uuid;
  v_cogs_account_id uuid;
  v_inventory_account_id uuid;
  v_sale_id uuid;
  v_journal_id uuid;
  v_line record;
  v_line_no int := 0;
  v_movement_id uuid;
  v_sale_line_id uuid;
  v_line_cogs numeric(14, 2);
  v_total_cogs numeric(14, 2) := 0;
begin
  select * into v_order from public.online_orders where id = p_order_id for update;

  if v_order.id is null then
    raise exception 'Online order not found for accounting posting';
  end if;

  if v_order.sale_id is not null then
    return v_order.sale_id;
  end if;

  if v_order.fulfillment_store_id is null then
    raise exception 'Cannot post accounting for an order with no fulfillment store assigned';
  end if;

  if p_payment_method not in ('COD', 'RAZORPAY') then
    raise exception 'Unsupported ecommerce payment method for accounting: %', p_payment_method;
  end if;

  v_attributed_profile_id := public.resolve_accounting_attribution_profile(v_order.organization_id);
  if v_attributed_profile_id is null then
    raise exception 'No OWNER profile found to attribute this posting to';
  end if;

  -- CTO decision: COD -> CASH, RAZORPAY -> BANK. Both control_account_type
  -- values already exist (0002); no new control-account type is added.
  v_control_type := case when p_payment_method = 'COD' then 'CASH' else 'BANK' end;

  v_debit_account_id := public.get_control_account_for_org(v_order.organization_id, v_control_type);
  v_revenue_account_id := public.get_role_account_for_org(v_order.organization_id, 'SALES_REVENUE');
  v_cogs_account_id := public.get_role_account_for_org(v_order.organization_id, 'COGS');
  v_inventory_account_id := public.get_role_account_for_org(v_order.organization_id, 'INVENTORY');

  insert into public.sales (
    organization_id, store_id, customer_id, customer_name, invoice_number, invoice_date,
    status, payment_method, subtotal, discount_amount, tax_amount, total_amount, amount_paid,
    created_by, posted_at, posted_by
  )
  select
    v_order.organization_id, v_order.fulfillment_store_id, v_order.customer_id, c.name,
    v_order.order_number, v_order.confirmed_at::date,
    'POSTED'::public.transaction_status,
    (case when p_payment_method = 'COD' then 'CASH' else 'BANK' end)::public.payment_method,
    v_order.subtotal, v_order.discount_total, v_order.tax_total, v_order.grand_total, v_order.grand_total,
    v_attributed_profile_id, now(), v_attributed_profile_id
  from public.customers c
  where c.id = v_order.customer_id
  returning id into v_sale_id;

  -- sale_lines.line_total is a generated column — not settable directly.
  insert into public.sale_lines (sale_id, line_no, item_id, uom_id, quantity, selling_rate, tax_amount)
  select
    v_sale_id,
    row_number() over (order by ol.created_at, ol.id),
    ol.item_id, i.uom_id, ol.quantity, ol.unit_price, ol.tax_amount
  from public.online_order_lines ol
  join public.items i on i.id = ol.item_id
  where ol.order_id = p_order_id;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id, created_by
  ) values (
    v_order.organization_id, v_order.fulfillment_store_id, v_order.confirmed_at::date, v_order.order_number,
    'Online sale ' || v_order.order_number, 'SALE', v_sale_id, v_attributed_profile_id
  ) returning id into v_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (v_journal_id, v_debit_account_id, v_order.grand_total, 0, 'Payment received: ' || v_order.order_number);

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (v_journal_id, v_revenue_account_id, 0, v_order.grand_total, 'Revenue: ' || v_order.order_number);

  for v_line in
    select id, item_id, quantity from public.online_order_lines where order_id = p_order_id order by created_at, id
  loop
    v_movement_id := public.record_online_sale_stock_out(
      v_order.organization_id, v_order.fulfillment_store_id, v_line.item_id, v_line.quantity,
      v_order.order_number, v_order.confirmed_at::date, 'Online sale ' || v_order.order_number,
      v_attributed_profile_id
    );

    select total_cost into v_line_cogs from public.stock_movement_costs where movement_id = v_movement_id;
    v_total_cogs := v_total_cogs + coalesce(v_line_cogs, 0);

    -- Same sale_line_movements linking post_sale() (0004) writes, so a
    -- future online-order return can find this exact historical cost
    -- again, the same way post_sales_return() already does for POS sales.
    -- One line per item per order (checkout_session_lines is unique per
    -- (checkout_session_id, item_id)), so matching sale_lines by item_id
    -- is unambiguous.
    select id into v_sale_line_id from public.sale_lines
      where sale_id = v_sale_id and item_id = v_line.item_id;

    insert into public.sale_line_movements (sale_line_id, movement_id)
    values (v_sale_line_id, v_movement_id);

    update public.stock_reservations
      set status = 'CONSUMED', consumed_at = now()
      where online_order_line_id = v_line.id and status = 'ACTIVE';
  end loop;

  if v_total_cogs > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (v_journal_id, v_cogs_account_id, v_total_cogs, 0, 'COGS: ' || v_order.order_number);
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (v_journal_id, v_inventory_account_id, 0, v_total_cogs, 'COGS: ' || v_order.order_number);
  end if;

  update public.sales set journal_entry_id = v_journal_id where id = v_sale_id;
  update public.online_orders set sale_id = v_sale_id where id = p_order_id;

  return v_sale_id;
end;
$$;

revoke all on function public.post_online_order_accounting(uuid, text) from public;

-- ============================================================
-- finalize_checkout_session_internal — re-issued with the accounting
-- posting added immediately after inventory reservation, inside the same
-- transaction. Everything else is byte-for-byte identical to 0024's
-- version. Because there is still no savepoint around either call, an
-- exception from post_online_order_accounting() rolls back the order,
-- lines, and reservation exactly like an inventory-reservation failure
-- already did — the required invariant is symmetric for both.
-- ============================================================

create or replace function public.finalize_checkout_session_internal(p_session_id uuid)
returns table (
  out_order_id uuid,
  out_order_number text,
  out_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_order_id uuid;
  v_order_number text;
begin
  select * into v_session from public.checkout_sessions where id = p_session_id for update;

  if v_session.id is null then
    raise exception 'Checkout session not found';
  end if;

  if v_session.status = 'COMPLETED' then
    select o.order_number into v_order_number from public.online_orders o where o.id = v_session.order_id;
    return query select v_session.order_id, v_order_number, 'CONFIRMED'::text;
    return;
  end if;

  if v_session.status not in ('OPEN', 'AWAITING_PAYMENT') then
    raise exception 'Checkout session is % and cannot be finalized', v_session.status;
  end if;

  v_order_number := 'ONL-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.online_order_number_seq')::text, 6, '0');

  begin
    insert into public.online_orders (
      organization_id, customer_id, order_number, status, payment_status,
      subtotal, tax_total, shipping_total, discount_total, grand_total,
      shipping_address_id, billing_address_id, idempotency_key, created_by, channel,
      fulfillment_store_id, confirmed_at
    ) values (
      v_session.organization_id, v_session.customer_id, v_order_number, 'CONFIRMED',
      case when v_session.payment_method = 'COD' then 'PENDING' else 'PAID' end,
      v_session.subtotal, v_session.tax_total, v_session.shipping_total, 0, v_session.grand_total,
      v_session.shipping_address_id, v_session.shipping_address_id, p_session_id::text, v_session.created_by,
      'WEBSITE', v_session.fulfillment_store_id, now()
    )
    returning id into v_order_id;
  exception when unique_violation then
    select id, order_number into v_order_id, v_order_number
      from public.online_orders
      where organization_id = v_session.organization_id
        and customer_id = v_session.customer_id
        and idempotency_key = p_session_id::text;
  end;

  if not exists (select 1 from public.online_order_lines where order_id = v_order_id) then
    insert into public.online_order_lines (
      organization_id, order_id, item_id, item_name_snapshot, unit_price, quantity, tax_amount, line_total
    )
    select v_session.organization_id, v_order_id, csl.item_id, csl.name_snapshot, csl.unit_price,
           csl.quantity, csl.tax_amount, csl.line_total
    from public.checkout_session_lines csl
    where csl.checkout_session_id = p_session_id;
  end if;

  if v_session.fulfillment_store_id is not null
     and not exists (
       select 1 from public.stock_reservations
       where online_order_id = v_order_id and status = 'ACTIVE'
     )
  then
    perform public.reserve_all_lines_at_store(v_order_id, v_session.fulfillment_store_id);
  end if;

  if v_session.fulfillment_store_id is not null then
    perform public.post_online_order_accounting(v_order_id, v_session.payment_method);
  end if;

  update public.checkout_sessions
    set status = 'COMPLETED', order_id = v_order_id, updated_at = now()
    where id = p_session_id;

  return query select v_order_id, v_order_number, 'CONFIRMED'::text;
end;
$$;

revoke all on function public.finalize_checkout_session_internal(uuid) from public;
