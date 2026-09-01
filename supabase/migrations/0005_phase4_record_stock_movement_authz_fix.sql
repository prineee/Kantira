-- KANTIRA Business OS — Security remediation
-- Closes a confirmed authorization gap in record_stock_movement(), found
-- during disposable-database validation of the recovered Phase 1-4
-- implementation. Purely additive: 0001-0004 are not modified.
--
-- DEFECT (confirmed by direct exploit against a disposable copy, never
-- against the authoritative database):
--   record_stock_movement() had no explicit `revoke ... from public`
--   after its definition in 0004_phase4_inventory_valuation.sql, unlike
--   every sibling function in that file (rebuild_item_store_cost,
--   get_item_store_average_cost, post_stock_adjustment, etc., all of
--   which explicitly revoke-then-grant). Postgres grants EXECUTE to
--   PUBLIC by default on CREATE FUNCTION unless explicitly revoked, so
--   record_stock_movement remained callable by any authenticated user —
--   and its body never checked that the caller's organization actually
--   owns p_store_id/p_item_id, nor any role. An authenticated user from
--   one organization could call it directly with another organization's
--   real store/item id (known or leaked, not merely guessed) and write
--   an arbitrary stock_movements + stock_movement_costs + item_store_costs
--   row against that store/item, corrupting stock_balances for a store/
--   item pair the caller has no access to. Within a single organization,
--   any authenticated user regardless of role could fabricate movements
--   the same way, bypassing every role check the legitimate wrapper RPCs
--   (post_purchase, post_sale, post_purchase_return, post_sales_return,
--   post_stock_adjustment, create_stock_transfer) perform before ever
--   reaching this function.
--
-- FIX (two parts, matching the security posture already used everywhere
-- else in this schema, not a new pattern):
--   1. Organization-ownership check on p_store_id and p_item_id, added to
--      the function body (CREATE OR REPLACE, identical signature — this
--      replaces the existing function object, it does not add an
--      overload). This is pure defense-in-depth: every legitimate caller
--      already only ever passes a store_id/item_id belonging to the
--      calling organization, so no legitimate behavior changes.
--   2. `revoke execute ... from authenticated` (and from public, for
--      style consistency with every other function in this schema), with
--      no replacement grant. This database provisions a default privilege
--      rule (`alter default privileges ... grant execute on functions to
--      authenticated`, visible in pg_default_acl) that grants EXECUTE
--      directly to the `authenticated` role on every new function at
--      creation time — not via the PUBLIC pseudo-role. This is *why* the
--      vulnerability existed even though nothing ever explicitly granted
--      authenticated access: 0004 never revoked it. Every sibling function
--      in 0004 that revokes "from public" also immediately re-grants to
--      authenticated explicitly, so this pre-existing, harmless quirk
--      (the same default rule also leaves an unused, functionally inert
--      grant to `anon`, neutralized by every function's own `caller_org_id
--      is null` check — confirmed by inspecting proacl, not assumed) never
--      mattered for them. It mattered here because this is the one
--      function meant to have *no* direct grant at all, so the revoke
--      must explicitly target the role that actually holds the privilege.
--      record_stock_movement is an internal primitive — every real write
--      path already goes through one of the six wrapper RPCs above, all
--      owned by the same role as this function, which retain implicit
--      execute on their own objects regardless of this revoke. This
--      matches the strictest existing pattern in the schema
--      (journal_entries/journal_entry_lines have no direct write path at
--      all, RPC-only) rather than the "revoke then grant to authenticated"
--      pattern used for functions meant to be called directly by clients.
--
-- Nothing else changes: no RLS policy is touched, no table is altered, no
-- accounting or inventory logic is redesigned, no other function's body
-- is modified.

create or replace function public.record_stock_movement(
  p_store_id uuid,
  p_item_id uuid,
  p_movement_type public.stock_movement_type,
  p_direction public.stock_direction,
  p_quantity numeric,
  p_unit_cost numeric,
  p_cost_basis public.cost_basis_source,
  p_source_movement_id uuid default null,
  p_reference text default null,
  p_transaction_date date default current_date,
  p_notes text default null,
  p_adjustment_reason public.stock_adjustment_reason default null,
  p_transfer_group_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  old_qty numeric(14, 3);
  old_total_value numeric(14, 2);
  resolved_unit_cost numeric(14, 4);
  movement_value numeric(14, 2);
  new_movement_id uuid;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Movement quantity must be greater than zero';
  end if;

  -- Security fix: the store and item a movement is recorded against must
  -- belong to the caller's own organization. Every legitimate caller
  -- (post_purchase, post_sale, post_purchase_return, post_sales_return,
  -- post_stock_adjustment, create_stock_transfer) already guarantees this
  -- before calling here, so this is a no-op for correct callers and a
  -- hard stop for anything that reaches this function without having done
  -- so — whether a direct client call or a future caller that forgets to
  -- check.
  if not exists (
    select 1 from public.stores where id = p_store_id and organization_id = caller_org_id
  ) then
    raise exception 'Store % not found in caller organization', p_store_id;
  end if;

  if not exists (
    select 1 from public.items where id = p_item_id and organization_id = caller_org_id
  ) then
    raise exception 'Item % not found in caller organization', p_item_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(case when direction = 'IN' then quantity else -quantity end), 0)
    into old_qty
    from public.stock_movements
    where store_id = p_store_id and item_id = p_item_id;

  select total_value into old_total_value
    from public.item_store_costs
    where organization_id = caller_org_id and store_id = p_store_id and item_id = p_item_id;
  old_total_value := coalesce(old_total_value, 0);

  if p_direction = 'OUT' then
    if old_qty < p_quantity then
      raise exception 'Insufficient stock for item % at store %: available %, requested %',
        p_item_id, p_store_id, old_qty, p_quantity;
    end if;

    if p_unit_cost is not null then
      resolved_unit_cost := p_unit_cost;
    elsif old_qty > 0 then
      resolved_unit_cost := round(old_total_value / old_qty, 4);
    else
      resolved_unit_cost := 0;
    end if;

    movement_value := round(p_quantity * resolved_unit_cost, 2);
    -- Defensive floor: never let compounding rounding across many small
    -- movements push the running value negative.
    if movement_value > old_total_value then
      movement_value := old_total_value;
    end if;
  else
    if p_unit_cost is null then
      if old_qty > 0 then
        resolved_unit_cost := round(old_total_value / old_qty, 4);
      else
        raise exception 'unit_cost is required for the first incoming movement of item % at store %',
          p_item_id, p_store_id;
      end if;
    else
      resolved_unit_cost := p_unit_cost;
    end if;

    movement_value := round(p_quantity * resolved_unit_cost, 2);
  end if;

  insert into public.stock_movements (
    organization_id, store_id, item_id, movement_type, direction, quantity,
    reference, transfer_group_id, transaction_date, notes, created_by
  ) values (
    caller_org_id, p_store_id, p_item_id, p_movement_type, p_direction, p_quantity,
    p_reference, p_transfer_group_id, p_transaction_date, p_notes, auth.uid()
  ) returning id into new_movement_id;

  insert into public.stock_movement_costs (
    movement_id, organization_id, unit_cost, total_cost, cost_basis, source_movement_id, adjustment_reason
  ) values (
    new_movement_id, caller_org_id, resolved_unit_cost, movement_value, p_cost_basis, p_source_movement_id, p_adjustment_reason
  );

  insert into public.item_store_costs (organization_id, store_id, item_id, total_value)
  values (
    caller_org_id, p_store_id, p_item_id,
    case when p_direction = 'IN' then old_total_value + movement_value else old_total_value - movement_value end
  )
  on conflict (organization_id, store_id, item_id)
  do update set total_value = excluded.total_value, updated_at = now();

  return new_movement_id;
end;
$$;

revoke all on function public.record_stock_movement(
  uuid, uuid, public.stock_movement_type, public.stock_direction, numeric, numeric,
  public.cost_basis_source, uuid, text, date, text, public.stock_adjustment_reason, uuid
) from public, authenticated;
