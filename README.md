# KANTIRA Business OS

Internal business management platform for Mapway Technologies Pvt. Ltd.
Multi-store, multi-role, RLS-enforced. Public site is `kantira.in`; this app
is the private `app.kantira.in` module.

## Phase 1 status

Foundation: auth, organizations, stores, profiles, employee store access,
roles, RLS. See `supabase/migrations/0001_phase1_foundation.sql`.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Connect to your Supabase project:

   - Copy `.env.local.example` to `.env.local` if you haven't already
     (a placeholder `.env.local` already exists in this repo).
   - Go to Supabase Dashboard → Project Settings → API and fill in:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Apply the database migration to your Supabase project:

   ```
   supabase login
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```

   This runs `supabase/migrations/0001_phase1_foundation.sql` against your
   project: creates the `organizations`, `profiles`, `stores`, and
   `employee_store_access` tables, the role/store-type enums, the
   `create_organization_with_owner` RPC, and all RLS policies.

4. In Supabase Dashboard → Authentication → Providers → Email, decide
   whether to require email confirmation. Either setting works with the
   sign-up flow in this app.

5. Run the dev server:

   ```
   npm run dev
   ```

6. Visit `http://localhost:3000/signup` to create the first organization
   and OWNER account. Subsequent users sign in at `/login`.

## Architecture notes

- Every table has RLS enabled. Authorization is derived from
  `auth.uid()` via `public.current_org_id()` / `public.current_role()` /
  `public.has_store_access()` — never from client-supplied IDs.
- Organizations are only ever created through the
  `create_organization_with_owner` RPC, not direct inserts.
- `types/database.ts` is hand-written to match the migration. Once linked
  to a live project, it can be regenerated with
  `supabase gen types typescript --linked`.
