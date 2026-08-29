-- KANTIRA Business OS — Phase 1: Foundation
-- Organizations, Stores, Profiles, Employee Store Access, Roles, RLS.
-- Source of truth for authorization is the database, never the frontend.

-- ============================================================
-- ENUMS
-- ============================================================

create type public.user_role as enum (
  'OWNER',
  'ADMIN',
  'STORE_MANAGER',
  'SALES',
  'STOCK',
  'ACCOUNTANT',
  'FRANCHISE'
);

create type public.store_type as enum (
  'COMPANY',
  'FRANCHISE'
);

-- ============================================================
-- UPDATED_AT TRIGGER HELPER
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- TABLE: organizations
-- ============================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  gstin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: profiles (1:1 with auth.users)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete restrict,
  full_name text,
  email text,
  role public.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: stores
-- ============================================================

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  store_code text not null,
  store_name text not null,
  type public.store_type not null default 'COMPANY',
  address text,
  city text,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, store_code)
);

create index stores_organization_id_idx on public.stores (organization_id);

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();

-- ============================================================
-- TABLE: employee_store_access
-- ============================================================

create table public.employee_store_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, store_id)
);

create index employee_store_access_profile_id_idx on public.employee_store_access (profile_id);
create index employee_store_access_store_id_idx on public.employee_store_access (store_id);

-- ============================================================
-- AUTHORIZATION HELPER FUNCTIONS
--
-- SECURITY DEFINER, owned by the migration role (table owner). Postgres
-- exempts table owners from RLS by default, so these functions can read
-- profiles/employee_store_access without recursing into their own RLS
-- policies. They are the ONLY place organization/role/store-access logic
-- lives — every policy below calls into these rather than re-deriving it.
-- ============================================================

create or replace function public.current_org_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.has_store_access(target_store_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_store_access esa
    where esa.profile_id = auth.uid()
      and esa.store_id = target_store_id
  );
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_role() from public;
revoke all on function public.has_store_access(uuid) from public;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.has_store_access(uuid) to authenticated;

-- ============================================================
-- ORGANIZATION BOOTSTRAP RPC
--
-- The only way an organization + its first OWNER profile get created.
-- No direct INSERT policy exists on organizations or profiles for this
-- purpose — invoice-number-style "database-safe mechanism", not a
-- frontend-trusted org_id. Callable once per authenticated user with no
-- existing profile.
-- ============================================================

create or replace function public.create_organization_with_owner(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  caller_id uuid := auth.uid();
  caller_email text;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from public.profiles where id = caller_id) then
    raise exception 'User already belongs to an organization';
  end if;

  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'Organization name is required';
  end if;

  select email into caller_email from auth.users where id = caller_id;

  insert into public.organizations (name)
  values (trim(org_name))
  returning id into new_org_id;

  insert into public.profiles (id, organization_id, email, role)
  values (caller_id, new_org_id, caller_email, 'OWNER');

  return new_org_id;
end;
$$;

revoke all on function public.create_organization_with_owner(text) from public;
grant execute on function public.create_organization_with_owner(text) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.employee_store_access enable row level security;

-- ---------- organizations ----------

create policy organizations_select on public.organizations
  for select
  to authenticated
  using (id = public.current_org_id());

create policy organizations_update_owner on public.organizations
  for update
  to authenticated
  using (id = public.current_org_id() and public.current_role() = 'OWNER')
  with check (id = public.current_org_id() and public.current_role() = 'OWNER');

-- No insert/delete policy: creation only via create_organization_with_owner(),
-- deletion is an operational action outside app scope for now.

-- ---------- profiles ----------

create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (
      organization_id = public.current_org_id()
      and public.current_role() in ('OWNER', 'ADMIN')
    )
    or (
      public.current_role() = 'STORE_MANAGER'
      and organization_id = public.current_org_id()
      and exists (
        select 1
        from public.employee_store_access mine
        join public.employee_store_access theirs
          on theirs.store_id = mine.store_id
        where mine.profile_id = auth.uid()
          and theirs.profile_id = profiles.id
      )
    )
  );

create policy profiles_insert_admin on public.profiles
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  );

create policy profiles_update_admin on public.profiles
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  )
  with check (organization_id = public.current_org_id());

create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Defense in depth: even under profiles_update_self, a non-admin must not
-- be able to change their own role, organization, or active status by
-- crafting a client request. RLS WITH CHECK alone can't express
-- "this column may not change unless X"; a trigger can.
create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() not in ('OWNER', 'ADMIN') then
    if new.role is distinct from old.role
      or new.organization_id is distinct from old.organization_id
      or new.is_active is distinct from old.is_active then
      raise exception 'Only OWNER or ADMIN may change role, organization, or active status';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privilege_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

-- No delete policy: deactivate via is_active instead of deleting profiles.

-- ---------- stores ----------

create policy stores_select on public.stores
  for select
  to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.current_role() in ('OWNER', 'ADMIN')
      or public.has_store_access(id)
    )
  );

create policy stores_insert_admin on public.stores
  for insert
  to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  );

create policy stores_update_admin on public.stores
  for update
  to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_role() in ('OWNER', 'ADMIN')
  )
  with check (organization_id = public.current_org_id());

-- No delete policy: deactivate via is_active instead of deleting stores.

-- ---------- employee_store_access ----------

create policy employee_store_access_select on public.employee_store_access
  for select
  to authenticated
  using (
    profile_id = auth.uid()
    or (
      public.current_role() in ('OWNER', 'ADMIN')
      and exists (
        select 1 from public.stores s
        where s.id = store_id and s.organization_id = public.current_org_id()
      )
    )
  );

create policy employee_store_access_insert_admin on public.employee_store_access
  for insert
  to authenticated
  with check (
    public.current_role() in ('OWNER', 'ADMIN')
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.organization_id = public.current_org_id()
    )
  );

create policy employee_store_access_delete_admin on public.employee_store_access
  for delete
  to authenticated
  using (
    public.current_role() in ('OWNER', 'ADMIN')
    and exists (
      select 1 from public.stores s
      where s.id = store_id and s.organization_id = public.current_org_id()
    )
  );
