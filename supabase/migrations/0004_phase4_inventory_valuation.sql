-- KANTIRA Business OS — Phase 4: COGS + Inventory Valuation
-- Adds weighted-average inventory costing, per-movement historical cost
-- snapshots, and COGS/gross-profit posting — closing the "COGS/inventory-
-- value is deliberately not posted on sale" limitation flagged at the end
-- of Phase 3. Additive to the database: 0001/0002/0003 files are untouched.
-- Five Phase 3 RPCs (post_purchase, post_sale, post_purchase_return,
-- post_sales_return, create_stock_transfer) are superseded here via
-- CREATE OR REPLACE FUNCTION — same name/signature, enhanced body — and
-- one Phase 3 RLS policy (stock_movements_insert) is dropped and not
-- replaced, tightening (never weakening) direct client write access.
-- See docs/architecture/PHASE_4_MASTER_BLUEPRINT.md for the full design
-- rationale, including why weighted-average costing was chosen and the one
-- explicitly-documented reconciliation gap (tax-inclusive Inventory
-- journal leg vs tax-exclusive valuation — §12 of the blueprint).

-- ============================================================
-- ENUM EXTENSION — must run first, and its new values must only ever be
-- referenced inside function bodies for the rest of this file (never in a
-- direct DML statement), per Postgres's "unsafe use of new value of enum
-- type" restriction within a single migration transaction. See blueprint
-- §9 for the full safety discussion and the documented fallback if this
-- ever needs verifying against a live database.
-- ============================================================

alter type public.ledger_account_role add value if not exists 'COGS';

alter type public.ledger_account_role add value if not exists 'INVENTORY_LOSS';

-- ============================================================
-- NEW ENUMS
-- ============================================================

create type public.cost_basis_source as enum (
  'WEIGHTED_AVERAGE',
  'HISTORICAL_LOT',
  'OPENING',
  'MANUAL'
);

create type public.stock_adjustment_reason as enum (
  'DAMAGE',
  'LOSS',
  'FOUND',
  'RECOUNT',
  'OTHER'
);

-- ============================================================
-- TABLE: item_store_costs
--
-- The one genuinely new piece of mutable state this phase introduces: a
-- running ₹ total value per (organization, store, item). Deliberately does
-- NOT store quantity — quantity_on_hand is always read live from Phase 2's
-- stock_balances view. average_cost is never stored either; it is always
-- derived as total_value / quantity_on_hand on read. A true weighted
-- average cannot be computed as a pure aggregate over raw movement history
-- once any sale has happened between two purchases at different prices
-- (see blueprint §A/B for the worked proof), so this running cache is a
-- mathematical necessity, not a shortcut — and it is always updated inside
-- the same advisory-lock scope as the stock_movements row it accompanies.
-- ============================================================

create table public.item_store_costs (
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  total_value numeric(14, 2) not null default 0 check (total_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, store_id, item_id)
);

-- ============================================================
-- TABLE: stock_movement_costs
--
-- Immutable, one row per stock_movements row. This is the permanent record
-- of what a specific unit of inventory movement cost, and why — nothing in
-- this migration ever UPDATEs it after insert. It is what makes historical
-- cost preservation hold structurally: a sale's COGS, once written here, is
-- never recomputed later regardless of subsequent purchases, price changes,
-- or average drift.
-- ============================================================

create table public.stock_movement_costs (
  movement_id uuid primary key references public.stock_movements (id) on delete cascade,
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  total_cost numeric(14, 2) not null check (total_cost >= 0),
  cost_basis public.cost_basis_source not null,
  source_movement_id uuid references public.stock_movements (id),
  adjustment_reason public.stock_adjustment_reason,
  created_at timestamptz not null default now()
);

create index stock_movement_costs_organization_id_idx on public.stock_movement_costs (organization_id);

create index stock_movement_costs_source_movement_id_idx on public.stock_movement_costs (source_movement_id);

-- ============================================================
-- TABLE: sale_line_movements
--
-- 1:1 map from a sale_lines row to the exact stock_movements row it
-- produced when the sale was posted. Phase 3's post_sale() never recorded
-- this link; Phase 4's replacement does, giving post_sales_return() a
-- direct path to the exact historical unit_cost charged to COGS at the
-- moment of the original sale — never today's average, never today's
-- price. No equivalent purchase_line_movements table is needed: a
-- purchase return re-derives its net unit cost straight from the still-
-- immutable purchase_lines row via purchase_line_net_unit_cost() below.
-- ============================================================

create table public.sale_line_movements (
  sale_line_id uuid primary key references public.sale_lines (id) on delete cascade,
  movement_id uuid not null references public.stock_movements (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index sale_line_movements_movement_id_idx on public.sale_line_movements (movement_id);

-- ============================================================
-- FUNCTION: purchase_line_net_unit_cost
--
-- The inventory cost basis for a purchase line: quantity and rate net of
-- the line's own discount, EXCLUDING tax_amount — matching Phase 3's
-- explicit "no GST/tax engine" limitation. Used both when a purchase is
-- first posted and, unchanged, when it is later returned.
-- ============================================================

create or replace function public.purchase_line_net_unit_cost(p_purchase_line_id uuid)
returns numeric
language sql
stable
as $$
  select round((quantity * purchase_rate - discount_amount) / quantity, 4)
  from public.purchase_lines
  where id = p_purchase_line_id;
$$;

-- ============================================================
-- FUNCTION: record_stock_movement
--
-- The single choke point for every cost-affecting stock movement from this
-- phase onward. Extends Phase 3's exact advisory-lock concurrency pattern
-- (pg_advisory_xact_lock keyed by store+item) so that the quantity check,
-- the cost read, and the cost write are one atomic, serialized unit per
-- (store, item) for every operation type — not just sales, as in Phase 3.
--
-- IN movements require an explicit unit_cost (the acquisition cost is
-- always externally known — a purchase rate, a transfer's source cost, a
-- historical lot being restored by a return) UNLESS stock already exists
-- for that store+item, in which case the current average is used as a
-- reasonable default (e.g. a routine "found stock" adjustment).
--
-- OUT movements derive unit_cost from the current running average unless
-- an explicit historical cost is passed in (purchase returns, which must
-- reverse at the ORIGINAL acquisition cost, not today's average).
-- ============================================================

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

-- ============================================================
-- FUNCTION: rebuild_item_store_cost
--
-- The reconciliation path: recomputes total_value from scratch by
-- replaying every stock_movements/stock_movement_costs row for a
-- store+item in chronological order, independently re-deriving what the
-- average should have been at each step rather than trusting any stored
-- figure. The authoritative recovery mechanism if item_store_costs is ever
-- suspected to have drifted. OWNER/ADMIN only — recomputes financial state.
-- ============================================================

create or replace function public.rebuild_item_store_cost(p_store_id uuid, p_item_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  rec record;
  running_qty numeric(14, 3) := 0;
  running_value numeric(14, 2) := 0;
  consume_cost numeric(14, 4);
  consume_value numeric(14, 2);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    raise exception 'Insufficient privileges to rebuild inventory cost';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_item_id::text, 0));

  for rec in
    select sm.direction, sm.quantity, smc.unit_cost
    from public.stock_movements sm
    join public.stock_movement_costs smc on smc.movement_id = sm.id
    where sm.store_id = p_store_id and sm.item_id = p_item_id and sm.organization_id = caller_org_id
    order by sm.created_at, sm.id
  loop
    if rec.direction = 'IN' then
      running_qty := running_qty + rec.quantity;
      running_value := running_value + round(rec.quantity * rec.unit_cost, 2);
    else
      if running_qty > 0 then
        consume_cost := round(running_value / running_qty, 4);
      else
        consume_cost := 0;
      end if;
      consume_value := round(rec.quantity * consume_cost, 2);
      if consume_value > running_value then
        consume_value := running_value;
      end if;
      running_qty := running_qty - rec.quantity;
      running_value := running_value - consume_value;
    end if;
  end loop;

  insert into public.item_store_costs (organization_id, store_id, item_id, total_value)
  values (caller_org_id, p_store_id, p_item_id, running_value)
  on conflict (organization_id, store_id, item_id)
  do update set total_value = excluded.total_value, updated_at = now();

  return running_value;
end;
$$;

revoke all on function public.rebuild_item_store_cost(uuid, uuid) from public;

grant execute on function public.rebuild_item_store_cost(uuid, uuid) to authenticated;

-- ============================================================
-- FUNCTION: get_item_store_average_cost — UI convenience read
-- ============================================================

create or replace function public.get_item_store_average_cost(p_store_id uuid, p_item_id uuid)
returns numeric
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  qty numeric(14, 3);
  val numeric(14, 2);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select quantity_on_hand into qty
  from public.stock_balances
  where organization_id = caller_org_id and store_id = p_store_id and item_id = p_item_id;

  select total_value into val
  from public.item_store_costs
  where organization_id = caller_org_id and store_id = p_store_id and item_id = p_item_id;

  if qty is null or qty = 0 then
    return 0;
  end if;

  return round(coalesce(val, 0) / qty, 4);
end;
$$;

revoke all on function public.get_item_store_average_cost(uuid, uuid) from public;

grant execute on function public.get_item_store_average_cost(uuid, uuid) to authenticated;

-- ============================================================
-- RPC: post_stock_adjustment
--
-- Handles ADJUSTMENT_IN, ADJUSTMENT_OUT, and DAMAGE. LOSS/FOUND (from the
-- brief) are represented via adjustment_reason ('LOSS' maps to an
-- ADJUSTMENT_OUT movement, 'FOUND' to an ADJUSTMENT_IN movement) rather
-- than extending Phase 2's stock_movement_type — see blueprint §2.
-- Postings symmetrically use ONE new INVENTORY_LOSS role account for both
-- directions (a variance account), per "add only the roles genuinely
-- required."
-- ============================================================

create or replace function public.post_stock_adjustment(
  p_store_id uuid,
  p_item_id uuid,
  p_movement_type public.stock_movement_type,
  p_quantity numeric,
  p_adjustment_reason public.stock_adjustment_reason,
  p_unit_cost numeric default null,
  p_reference text default null,
  p_transaction_date date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  direction public.stock_direction;
  new_movement_id uuid;
  new_journal_id uuid;
  loss_account_id uuid;
  inventory_account_id uuid;
  movement_value numeric(14, 2);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_movement_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE') then
    raise exception 'post_stock_adjustment only supports ADJUSTMENT_IN, ADJUSTMENT_OUT, or DAMAGE';
  end if;

  if not exists (select 1 from public.stores where id = p_store_id and organization_id = caller_org_id) then
    raise exception 'Store not found in organization';
  end if;

  if not exists (select 1 from public.items where id = p_item_id and organization_id = caller_org_id) then
    raise exception 'Item not found in organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK' or not public.has_store_access(p_store_id) then
      raise exception 'Insufficient privileges to adjust stock for this store';
    end if;
  end if;

  direction := case when p_movement_type = 'ADJUSTMENT_IN' then 'IN' else 'OUT' end;

  new_movement_id := public.record_stock_movement(
    p_store_id, p_item_id, p_movement_type, direction, p_quantity,
    p_unit_cost, 'MANUAL', null, p_reference, p_transaction_date, p_notes, p_adjustment_reason
  );

  select total_cost into movement_value
  from public.stock_movement_costs
  where movement_id = new_movement_id;

  -- A zero-cost adjustment (e.g. a free-sample item with no cost basis
  -- yet) still moves quantity but has nothing to post — journal_entry_lines
  -- requires every line to be strictly debit>0 or credit>0.
  if movement_value > 0 then
    loss_account_id := public.get_role_account('INVENTORY_LOSS');
    inventory_account_id := public.get_role_account('INVENTORY');

    insert into public.journal_entries (
      organization_id, store_id, entry_date, reference, description, source_type, source_id
    ) values (
      caller_org_id, p_store_id, p_transaction_date, p_reference,
      p_movement_type || ' (' || p_adjustment_reason || ')', 'ADJUSTMENT', new_movement_id
    ) returning id into new_journal_id;

    if direction = 'OUT' then
      insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      values (new_journal_id, loss_account_id, movement_value, 0, 'Inventory write-off');
      insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      values (new_journal_id, inventory_account_id, 0, movement_value, 'Inventory write-off');
    else
      insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      values (new_journal_id, inventory_account_id, movement_value, 0, 'Inventory adjustment');
      insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
      values (new_journal_id, loss_account_id, 0, movement_value, 'Inventory adjustment');
    end if;
  end if;

  return new_movement_id;
end;
$$;

revoke all on function public.post_stock_adjustment(
  uuid, uuid, public.stock_movement_type, numeric, public.stock_adjustment_reason, numeric, text, date, text
) from public;

grant execute on function public.post_stock_adjustment(
  uuid, uuid, public.stock_movement_type, numeric, public.stock_adjustment_reason, numeric, text, date, text
) to authenticated;

-- ============================================================
-- RPC: post_purchase (REPLACES Phase 3's version)
--
-- Identical validation and journal posting to Phase 3 (Dr Inventory / Cr
-- Payable at the tax-inclusive total — see blueprint §12 for why this is
-- deliberately unchanged). The only change: each line's stock movement now
-- goes through record_stock_movement() with the tax-EXCLUDED net unit cost,
-- establishing this purchase's contribution to item_store_costs.
-- ============================================================

create or replace function public.post_purchase(p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  purchase_row public.purchases;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  inventory_account_id uuid;
  payable_account_id uuid;
  line_rec record;
  net_cost numeric(14, 4);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into purchase_row from public.purchases where id = p_purchase_id for update;
  if not found or purchase_row.organization_id <> caller_org_id then
    raise exception 'Purchase not found';
  end if;

  if purchase_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT purchases can be posted (current status: %)', purchase_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK' or not public.has_store_access(purchase_row.store_id) then
      raise exception 'Insufficient privileges to post purchases for this store';
    end if;
  end if;

  if not exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id) then
    raise exception 'Cannot post a purchase with no line items';
  end if;

  if exists (
    select 1
    from public.purchase_lines pl
    join public.items i on i.id = pl.item_id
    where pl.purchase_id = p_purchase_id and i.organization_id <> caller_org_id
  ) then
    raise exception 'Purchase contains an item from a different organization';
  end if;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.purchase_lines where purchase_id = p_purchase_id;

  computed_total := computed_subtotal - purchase_row.discount_amount + purchase_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed purchase total cannot be negative';
  end if;

  inventory_account_id := public.get_role_account('INVENTORY');
  payable_account_id := public.get_control_account('SUPPLIER');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, purchase_row.store_id, purchase_row.document_date, purchase_row.document_number,
    'Purchase ' || purchase_row.document_number, 'PURCHASE', p_purchase_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, inventory_account_id, computed_total, 0, 'Inventory received: ' || purchase_row.document_number);

  insert into public.journal_entry_lines (journal_entry_id, account_id, supplier_id, debit, credit, description)
  values (new_journal_id, payable_account_id, purchase_row.supplier_id, 0, computed_total, 'Payable: ' || purchase_row.document_number);

  for line_rec in
    select * from public.purchase_lines where purchase_id = p_purchase_id order by line_no
  loop
    net_cost := public.purchase_line_net_unit_cost(line_rec.id);

    perform public.record_stock_movement(
      purchase_row.store_id, line_rec.item_id, 'PURCHASE', 'IN', line_rec.quantity,
      net_cost, 'HISTORICAL_LOT', null, purchase_row.document_number, purchase_row.document_date,
      'Purchase ' || purchase_row.document_number, null
    );
  end loop;

  update public.purchases
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_purchase_id;

  return new_journal_id;
end;
$$;

-- ============================================================
-- RPC: post_sale (REPLACES Phase 3's version)
--
-- Adds a second, balanced journal pair (Dr COGS / Cr Inventory) alongside
-- the unchanged Phase 3 revenue pair, sourced from record_stock_movement()'s
-- own computed total_cost for each line. Records sale_line_movements so a
-- future return can find this exact historical cost again.
-- ============================================================

create or replace function public.post_sale(p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  sale_row public.sales;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  revenue_account_id uuid;
  debit_account_id uuid;
  debit_control_type public.control_account_type;
  cogs_account_id uuid;
  inventory_account_id uuid;
  line_rec record;
  new_movement_id uuid;
  line_cogs numeric(14, 2);
  total_cogs numeric(14, 2) := 0;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into sale_row from public.sales where id = p_sale_id for update;
  if not found or sale_row.organization_id <> caller_org_id then
    raise exception 'Sale not found';
  end if;

  if sale_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT sales can be posted (current status: %)', sale_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'SALES' or not public.has_store_access(sale_row.store_id) then
      raise exception 'Insufficient privileges to post sales for this store';
    end if;
  end if;

  if not exists (select 1 from public.sale_lines where sale_id = p_sale_id) then
    raise exception 'Cannot post a sale with no line items';
  end if;

  if exists (
    select 1
    from public.sale_lines sl
    join public.items i on i.id = sl.item_id
    where sl.sale_id = p_sale_id and i.organization_id <> caller_org_id
  ) then
    raise exception 'Sale contains an item from a different organization';
  end if;

  if sale_row.customer_id is not null
    and not exists (select 1 from public.customers where id = sale_row.customer_id and organization_id = caller_org_id)
  then
    raise exception 'Customer not found in organization';
  end if;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.sale_lines where sale_id = p_sale_id;

  computed_total := computed_subtotal - sale_row.discount_amount + sale_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed sale total cannot be negative';
  end if;

  if sale_row.payment_method = 'CREDIT' then
    if sale_row.customer_id is null then
      raise exception 'Credit sales require a registered customer';
    end if;
    if sale_row.amount_paid <> 0 then
      raise exception 'Credit sales cannot have an amount paid';
    end if;
    debit_account_id := public.get_control_account('CUSTOMER');
  else
    debit_control_type := public.control_type_for_payment_method(sale_row.payment_method);
    if debit_control_type is null then
      raise exception 'Unsupported payment method for posting: %', sale_row.payment_method;
    end if;
    debit_account_id := public.get_control_account(debit_control_type);
  end if;

  revenue_account_id := public.get_role_account('SALES_REVENUE');
  cogs_account_id := public.get_role_account('COGS');
  inventory_account_id := public.get_role_account('INVENTORY');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, sale_row.store_id, sale_row.invoice_date, sale_row.invoice_number,
    'Sale ' || sale_row.invoice_number, 'SALE', p_sale_id
  ) returning id into new_journal_id;

  if sale_row.payment_method = 'CREDIT' then
    insert into public.journal_entry_lines (journal_entry_id, account_id, customer_id, debit, credit, description)
    values (new_journal_id, debit_account_id, sale_row.customer_id, computed_total, 0, 'Receivable: ' || sale_row.invoice_number);
  else
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, debit_account_id, computed_total, 0, 'Payment received: ' || sale_row.invoice_number);
  end if;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, revenue_account_id, 0, computed_total, 'Revenue: ' || sale_row.invoice_number);

  for line_rec in
    select * from public.sale_lines where sale_id = p_sale_id order by line_no
  loop
    new_movement_id := public.record_stock_movement(
      sale_row.store_id, line_rec.item_id, 'SALE', 'OUT', line_rec.quantity,
      null, 'WEIGHTED_AVERAGE', null, sale_row.invoice_number, sale_row.invoice_date,
      'Sale ' || sale_row.invoice_number, null
    );

    insert into public.sale_line_movements (sale_line_id, movement_id)
    values (line_rec.id, new_movement_id);

    select total_cost into line_cogs from public.stock_movement_costs where movement_id = new_movement_id;
    total_cogs := total_cogs + coalesce(line_cogs, 0);
  end loop;

  if total_cogs > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, cogs_account_id, total_cogs, 0, 'COGS: ' || sale_row.invoice_number);
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, inventory_account_id, 0, total_cogs, 'COGS: ' || sale_row.invoice_number);
  end if;

  update public.sales
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_sale_id;

  return new_journal_id;
end;
$$;

-- ============================================================
-- RPC: post_purchase_return (REPLACES Phase 3's version)
--
-- Same validation as Phase 3. Each line's OUT movement now uses
-- purchase_line_net_unit_cost() re-derived from the ORIGINAL purchase
-- line — never today's average, never the return line's own copied rate —
-- so the reversal always matches what was actually capitalized.
-- assert_stock_available() is no longer called separately; the same check
-- now lives inside record_stock_movement().
-- ============================================================

create or replace function public.post_purchase_return(p_purchase_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  return_row public.purchase_returns;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  inventory_account_id uuid;
  payable_account_id uuid;
  line_rec record;
  already_returned numeric(14, 3);
  original_qty numeric(14, 3);
  net_cost numeric(14, 4);
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into return_row from public.purchase_returns where id = p_purchase_return_id for update;
  if not found or return_row.organization_id <> caller_org_id then
    raise exception 'Purchase return not found';
  end if;

  if return_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT purchase returns can be posted (current status: %)', return_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK' or not public.has_store_access(return_row.store_id) then
      raise exception 'Insufficient privileges to post purchase returns for this store';
    end if;
  end if;

  if not exists (select 1 from public.purchase_return_lines where purchase_return_id = p_purchase_return_id) then
    raise exception 'Cannot post a purchase return with no line items';
  end if;

  for line_rec in
    select * from public.purchase_return_lines where purchase_return_id = p_purchase_return_id order by line_no
  loop
    select pl.quantity into original_qty
    from public.purchase_lines pl
    where pl.id = line_rec.original_purchase_line_id and pl.purchase_id = return_row.original_purchase_id;

    if original_qty is null then
      raise exception 'Return line does not reference a line item on the original purchase';
    end if;

    select coalesce(sum(prl.quantity), 0) into already_returned
    from public.purchase_return_lines prl
    join public.purchase_returns pr on pr.id = prl.purchase_return_id
    where prl.original_purchase_line_id = line_rec.original_purchase_line_id
      and pr.status = 'POSTED';

    if already_returned + line_rec.quantity > original_qty then
      raise exception 'Return quantity for line % exceeds remaining returnable quantity (original %, already returned %, requested %)',
        line_rec.line_no, original_qty, already_returned, line_rec.quantity;
    end if;
  end loop;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.purchase_return_lines where purchase_return_id = p_purchase_return_id;

  computed_total := computed_subtotal - return_row.discount_amount + return_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed purchase return total cannot be negative';
  end if;

  inventory_account_id := public.get_role_account('INVENTORY');
  payable_account_id := public.get_control_account('SUPPLIER');

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, return_row.store_id, return_row.return_date, return_row.return_number,
    'Purchase return ' || return_row.return_number, 'ADJUSTMENT', p_purchase_return_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, supplier_id, debit, credit, description)
  values (new_journal_id, payable_account_id, return_row.supplier_id, computed_total, 0, 'Payable reversed: ' || return_row.return_number);

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, inventory_account_id, 0, computed_total, 'Inventory returned: ' || return_row.return_number);

  for line_rec in
    select * from public.purchase_return_lines where purchase_return_id = p_purchase_return_id order by line_no
  loop
    net_cost := public.purchase_line_net_unit_cost(line_rec.original_purchase_line_id);

    perform public.record_stock_movement(
      return_row.store_id, line_rec.item_id, 'PURCHASE_RETURN', 'OUT', line_rec.quantity,
      net_cost, 'HISTORICAL_LOT', null, return_row.return_number, return_row.return_date,
      'Purchase return ' || return_row.return_number, null
    );
  end loop;

  update public.purchase_returns
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_purchase_return_id;

  return new_journal_id;
end;
$$;

-- ============================================================
-- RPC: post_sales_return (REPLACES Phase 3's version)
--
-- Each line's IN movement uses the EXACT historical unit_cost from the
-- original sale (via sale_line_movements → stock_movement_costs), never
-- today's average. Posts the exact COGS reversal (Dr Inventory / Cr COGS)
-- alongside the unchanged Phase 3 revenue reversal.
-- ============================================================

create or replace function public.post_sales_return(p_sales_return_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  return_row public.sales_returns;
  original_sale_row public.sales;
  computed_subtotal numeric(14, 2);
  computed_total numeric(14, 2);
  new_journal_id uuid;
  revenue_account_id uuid;
  credit_account_id uuid;
  credit_control_type public.control_account_type;
  inventory_account_id uuid;
  cogs_account_id uuid;
  line_rec record;
  already_returned numeric(14, 3);
  original_qty numeric(14, 3);
  original_movement_id uuid;
  historical_unit_cost numeric(14, 4);
  new_movement_id uuid;
  line_cogs numeric(14, 2);
  total_cogs_reversed numeric(14, 2) := 0;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  select * into return_row from public.sales_returns where id = p_sales_return_id for update;
  if not found or return_row.organization_id <> caller_org_id then
    raise exception 'Sales return not found';
  end if;

  if return_row.status <> 'DRAFT' then
    raise exception 'Only DRAFT sales returns can be posted (current status: %)', return_row.status;
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'SALES' or not public.has_store_access(return_row.store_id) then
      raise exception 'Insufficient privileges to post sales returns for this store';
    end if;
  end if;

  if not exists (select 1 from public.sales_return_lines where sales_return_id = p_sales_return_id) then
    raise exception 'Cannot post a sales return with no line items';
  end if;

  select * into original_sale_row from public.sales where id = return_row.original_sale_id;
  if original_sale_row is null or original_sale_row.status <> 'POSTED' then
    raise exception 'Original sale is not a posted sale';
  end if;

  for line_rec in
    select * from public.sales_return_lines where sales_return_id = p_sales_return_id order by line_no
  loop
    select sl.quantity into original_qty
    from public.sale_lines sl
    where sl.id = line_rec.original_sale_line_id and sl.sale_id = return_row.original_sale_id;

    if original_qty is null then
      raise exception 'Return line does not reference a line item on the original sale';
    end if;

    select coalesce(sum(srl.quantity), 0) into already_returned
    from public.sales_return_lines srl
    join public.sales_returns sr on sr.id = srl.sales_return_id
    where srl.original_sale_line_id = line_rec.original_sale_line_id
      and sr.status = 'POSTED';

    if already_returned + line_rec.quantity > original_qty then
      raise exception 'Return quantity for line % exceeds remaining returnable quantity (original %, already returned %, requested %)',
        line_rec.line_no, original_qty, already_returned, line_rec.quantity;
    end if;
  end loop;

  select coalesce(sum(line_total), 0) into computed_subtotal
  from public.sales_return_lines where sales_return_id = p_sales_return_id;

  computed_total := computed_subtotal - return_row.discount_amount + return_row.tax_amount;

  if computed_total < 0 then
    raise exception 'Computed sales return total cannot be negative';
  end if;

  revenue_account_id := public.get_role_account('SALES_REVENUE');
  cogs_account_id := public.get_role_account('COGS');
  inventory_account_id := public.get_role_account('INVENTORY');

  if original_sale_row.payment_method = 'CREDIT' then
    credit_account_id := public.get_control_account('CUSTOMER');
  else
    credit_control_type := public.control_type_for_payment_method(original_sale_row.payment_method);
    if credit_control_type is null then
      raise exception 'Unsupported payment method on original sale for return posting: %', original_sale_row.payment_method;
    end if;
    credit_account_id := public.get_control_account(credit_control_type);
  end if;

  insert into public.journal_entries (
    organization_id, store_id, entry_date, reference, description, source_type, source_id
  ) values (
    caller_org_id, return_row.store_id, return_row.return_date, return_row.return_number,
    'Sales return ' || return_row.return_number, 'ADJUSTMENT', p_sales_return_id
  ) returning id into new_journal_id;

  insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  values (new_journal_id, revenue_account_id, computed_total, 0, 'Revenue reversed: ' || return_row.return_number);

  if original_sale_row.payment_method = 'CREDIT' then
    insert into public.journal_entry_lines (journal_entry_id, account_id, customer_id, debit, credit, description)
    values (new_journal_id, credit_account_id, original_sale_row.customer_id, 0, computed_total, 'Receivable reversed: ' || return_row.return_number);
  else
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, credit_account_id, 0, computed_total, 'Refund issued: ' || return_row.return_number);
  end if;

  for line_rec in
    select * from public.sales_return_lines where sales_return_id = p_sales_return_id order by line_no
  loop
    select slm.movement_id into original_movement_id
    from public.sale_line_movements slm
    where slm.sale_line_id = line_rec.original_sale_line_id;

    if original_movement_id is null then
      raise exception 'No historical cost record found for the original sale line';
    end if;

    select unit_cost into historical_unit_cost
    from public.stock_movement_costs
    where movement_id = original_movement_id;

    new_movement_id := public.record_stock_movement(
      return_row.store_id, line_rec.item_id, 'SALE_RETURN', 'IN', line_rec.quantity,
      historical_unit_cost, 'HISTORICAL_LOT', original_movement_id, return_row.return_number, return_row.return_date,
      'Sales return ' || return_row.return_number, null
    );

    select total_cost into line_cogs from public.stock_movement_costs where movement_id = new_movement_id;
    total_cogs_reversed := total_cogs_reversed + coalesce(line_cogs, 0);
  end loop;

  if total_cogs_reversed > 0 then
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, inventory_account_id, total_cogs_reversed, 0, 'COGS reversed: ' || return_row.return_number);
    insert into public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    values (new_journal_id, cogs_account_id, 0, total_cogs_reversed, 'COGS reversed: ' || return_row.return_number);
  end if;

  update public.sales_returns
    set status = 'POSTED',
        subtotal = computed_subtotal,
        total_amount = computed_total,
        journal_entry_id = new_journal_id,
        posted_at = now(),
        posted_by = auth.uid()
    where id = p_sales_return_id;

  return new_journal_id;
end;
$$;

-- ============================================================
-- RPC: create_stock_transfer (REPLACES Phase 3's version)
--
-- Resolves the source store's current average cost once, under lock, then
-- posts both legs through record_stock_movement() with that same resolved
-- cost. The value leaving the source is preserved exactly (never invented);
-- because the destination leg is an ordinary IN movement, the existing
-- blend formula automatically recalculates the destination's own average —
-- no transfer-specific math needed beyond resolving the source cost once.
-- No journal entry: INVENTORY is one org-wide account, not per-store, so a
-- transfer's Dr/Cr would net to the same account and mean nothing at the
-- GL level (see blueprint §D/L).
-- ============================================================

create or replace function public.create_stock_transfer(
  p_from_store_id uuid,
  p_to_store_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_reference text default null,
  p_transaction_date date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_org_id uuid := public.current_org_id();
  caller_role public.user_role := public.current_role();
  group_id uuid := gen_random_uuid();
  source_qty numeric(14, 3);
  source_value numeric(14, 2);
  source_unit_cost numeric(14, 4);
  out_movement_id uuid;
begin
  if caller_org_id is null then
    raise exception 'Not authenticated or no organization';
  end if;

  if p_from_store_id = p_to_store_id then
    raise exception 'Source and destination stores must be different';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero';
  end if;

  if not exists (select 1 from public.stores where id = p_from_store_id and organization_id = caller_org_id) then
    raise exception 'Source store not found in organization';
  end if;

  if not exists (select 1 from public.stores where id = p_to_store_id and organization_id = caller_org_id) then
    raise exception 'Destination store not found in organization';
  end if;

  if caller_role not in ('OWNER', 'ADMIN') then
    if caller_role <> 'STOCK'
      or not public.has_store_access(p_from_store_id)
      or not public.has_store_access(p_to_store_id) then
      raise exception 'Insufficient privileges to transfer stock between these stores';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_from_store_id::text || ':' || p_item_id::text, 0));

  select coalesce(sum(case when direction = 'IN' then quantity else -quantity end), 0)
    into source_qty
    from public.stock_movements
    where store_id = p_from_store_id and item_id = p_item_id;

  select total_value into source_value
    from public.item_store_costs
    where organization_id = caller_org_id and store_id = p_from_store_id and item_id = p_item_id;
  source_value := coalesce(source_value, 0);

  if source_qty > 0 then
    source_unit_cost := round(source_value / source_qty, 4);
  else
    source_unit_cost := 0;
  end if;

  out_movement_id := public.record_stock_movement(
    p_from_store_id, p_item_id, 'TRANSFER_OUT', 'OUT', p_quantity,
    source_unit_cost, 'WEIGHTED_AVERAGE', null, p_reference, p_transaction_date, p_notes, null, group_id
  );

  perform public.record_stock_movement(
    p_to_store_id, p_item_id, 'TRANSFER_IN', 'IN', p_quantity,
    source_unit_cost, 'WEIGHTED_AVERAGE', out_movement_id, p_reference, p_transaction_date, p_notes, null, group_id
  );

  return group_id;
end;
$$;

-- ============================================================
-- VIEWS: inventory_valuation, sale_line_cogs, sale_profitability
--
-- security_invoker so each view applies the querying user's own RLS on the
-- underlying tables, never the view owner's. No values are stored — every
-- figure is derived on read from stock_balances (Phase 2), item_store_costs,
-- and stock_movement_costs.
-- ============================================================

create view public.inventory_valuation
with (security_invoker = true) as
select
  sb.organization_id,
  sb.store_id,
  sb.item_id,
  sb.quantity_on_hand,
  coalesce(isc.total_value, 0) as total_value,
  case when sb.quantity_on_hand > 0 then round(coalesce(isc.total_value, 0) / sb.quantity_on_hand, 4) else 0 end as average_cost
from public.stock_balances sb
left join public.item_store_costs isc
  on isc.organization_id = sb.organization_id
  and isc.store_id = sb.store_id
  and isc.item_id = sb.item_id;

grant select on public.inventory_valuation to authenticated;

create view public.sale_line_cogs
with (security_invoker = true) as
select
  sl.id as sale_line_id,
  sl.sale_id,
  smc.unit_cost,
  smc.total_cost as cogs
from public.sale_lines sl
join public.sale_line_movements slm on slm.sale_line_id = sl.id
join public.stock_movement_costs smc on smc.movement_id = slm.movement_id;

grant select on public.sale_line_cogs to authenticated;

create view public.sale_profitability
with (security_invoker = true) as
select
  s.id as sale_id,
  s.organization_id,
  s.store_id,
  s.invoice_number,
  s.invoice_date,
  s.total_amount as revenue,
  coalesce(sum(slc.cogs), 0) as cogs,
  s.total_amount - coalesce(sum(slc.cogs), 0) as gross_profit,
  case when s.total_amount > 0
    then round((s.total_amount - coalesce(sum(slc.cogs), 0)) / s.total_amount * 100, 2)
    else 0
  end as gross_margin_percent
from public.sales s
left join public.sale_line_cogs slc on slc.sale_id = s.id
where s.status = 'POSTED'
group by s.id, s.organization_id, s.store_id, s.invoice_number, s.invoice_date, s.total_amount;

grant select on public.sale_profitability to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.item_store_costs enable row level security;

alter table public.stock_movement_costs enable row level security;

alter table public.sale_line_movements enable row level security;

-- No insert/update/delete policy on any of the three: every write happens
-- inside record_stock_movement() (SECURITY DEFINER). Cost and COGS figures
-- cannot be manipulated by changing an ID in a request because there is no
-- request shape that writes them directly.

create policy item_store_costs_select on public.item_store_costs
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
      or public.has_store_access(store_id)
    )
  );

create policy stock_movement_costs_select on public.stock_movement_costs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.stock_movements sm
      where sm.id = stock_movement_costs.movement_id
        and sm.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(sm.store_id)
        )
    )
  );

create policy sale_line_movements_select on public.sale_line_movements
  for select
  to authenticated
  using (
    exists (
      select 1 from public.sale_lines sl
      join public.sales s on s.id = sl.sale_id
      where sl.id = sale_line_movements.sale_line_id
        and s.organization_id = public.current_org_id()
        and (
          public.current_role() in ('OWNER', 'ADMIN', 'ACCOUNTANT')
          or public.has_store_access(s.store_id)
        )
    )
  );

-- Tighten Phase 3's direct-insert policy on stock_movements: every movement
-- must now carry a cost row created atomically by record_stock_movement(),
-- which a direct client INSERT cannot do. This moves ALL movement types
-- (not just transfers, which were already RPC-only) onto the same
-- "no direct insert policy, RPC only" posture journal_entries has always
-- had. A tightening, never a weakening, of Phase 3's security posture.
drop policy if exists stock_movements_insert on public.stock_movements;

