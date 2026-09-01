-- KANTIRA Business OS — Priority 5A: customer identity audit attribution
--
-- RECONSTRUCTED, not original file text. The original migration file for
-- 0014 does not exist anywhere on F: and was applied via `psql -f` directly
-- rather than the tracked `supabase migration` flow, so its statement text
-- was never captured in supabase_migrations.schema_migrations (unlike
-- 0005-0013, which were recovered verbatim from that table). Every
-- statement below was instead derived directly from the live database's
-- own canonical catalog output — pg_get_functiondef(), pg_get_constraintdef(),
-- pg_get_indexdef(), \d audit_log, and pg_policies — on 2026-08-29, not
-- guessed or inferred from intent. Applying this file to a disposable copy
-- of 0001-0013 and comparing its resulting schema/function bytes against
-- the authoritative live database is required before this reconstruction
-- is trusted (see PHASE_5_MASTER_RECOVERY_AND_ROADMAP.md for that result).
--
-- CONTEXT: 0009 (priority5a_customer_auth_linkage) gave customers a way to
-- read their own data but did not touch audit_log — record_audit_log()
-- could previously only attribute a change to `changed_by` (a profiles.id,
-- i.e. staff). Any write made by a linked customer (today: none — 0009 is
-- read-only; this exists so a future customer-initiated write, e.g. a
-- self-service profile edit, has somewhere safe to record attribution)
-- would otherwise be logged with changed_by = NULL, indistinguishable from
-- "system/unknown". This migration adds a second, mutually-exclusive actor
-- column rather than overloading `changed_by` or weakening its existing
-- `references public.profiles (id)` foreign key — employee attribution is
-- completely unchanged.
--
-- Purely additive: 0001-0013 are not modified except record_audit_log(),
-- which is CREATE OR REPLACE with the same signature/trigger wiring — no
-- existing trigger definition needs to change. No RLS policy on audit_log
-- is added or altered (audit_log_select remains OWNER/ADMIN only, exactly
-- as 0002 defined it — verified unchanged against the live database).

-- ============================================================
-- COLUMN: audit_log.changed_by_customer_id
-- ============================================================

alter table public.audit_log
  add column changed_by_customer_id uuid references public.customers (id);

create index audit_log_changed_by_customer_id_idx on public.audit_log (changed_by_customer_id);

-- Exactly one actor kind (or neither, e.g. a system/trigger-only write)
-- per row — never both a staff and a customer attribution on the same
-- audit entry.
alter table public.audit_log
  add constraint audit_log_single_actor_chk
  check (changed_by is null or changed_by_customer_id is null);

-- ============================================================
-- FUNCTION: record_audit_log() — replaces the 0002 definition
--
-- Resolution order per write: if auth.uid() matches a profiles row, log it
-- as staff (changed_by), exactly as before. Only if no staff profile
-- matches does it check whether auth.uid() matches a customers row linked
-- (auth_user_id) within the same org as the changed record, and if so log
-- it as that customer (changed_by_customer_id) instead. A write with no
-- matching identity on either side (e.g. triggered by a SECURITY DEFINER
-- function running as the table owner outside any request context) still
-- logs with both columns null, exactly as record_audit_log() always did
-- before this migration existed.
-- ============================================================

create or replace function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_org_id uuid;
  v_uid uuid := auth.uid();
  v_changed_by uuid;
  v_changed_by_customer_id uuid;
begin
  row_org_id := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;

  if v_uid is not null then
    select id into v_changed_by from public.profiles where id = v_uid;

    if v_changed_by is null then
      select id into v_changed_by_customer_id
      from public.customers
      where auth_user_id = v_uid
        and organization_id = row_org_id;
    end if;
  end if;

  insert into public.audit_log (
    organization_id, table_name, record_id, action,
    changed_by, changed_by_customer_id, old_data, new_data
  )
  values (
    row_org_id,
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op::public.audit_action,
    v_changed_by,
    v_changed_by_customer_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return null;
end;
$$;
