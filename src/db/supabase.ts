import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getAllIngredients, saveIngredient, deleteIngredient } from './ingredients'
import { getAllRecipes, saveRecipe, deleteRecipe } from './recipes'
import { getAllHouseholdItems, saveHouseholdItem } from './householdItems'
import { getAllCollections, saveCollection } from './collections'
import { getAllReferences, saveReference } from './references'
import { saveMealPlanDay } from './mealPlan'
import { saveGroceryList } from './groceryLists'
import { loadSettings, saveSettingsWithTimestamp } from './settings'
import { getDB } from './schema'
import type {
  Ingredient, Recipe, AppSettings, MealPlanDay, GroceryList,
  HouseholdItem, RecipeCollection, KitchenReference, AIProvider,
} from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SyncDuplicate {
  type: 'ingredient' | 'recipe'
  localItem: Ingredient | Recipe
  cloudItem: Ingredient | Recipe
}

export interface SyncSummary {
  addedLocally: number
  uploadedToCloud: number
  updatedToNewer: number
  duplicatesForReview: SyncDuplicate[]
  errors: string[]
}

type CloudRow = { id: string; household_code: string; data: unknown; updated_at: string }

// ─── Client Factory ─────────────────────────────────────────────────────────

let _client: SupabaseClient | null = null
let _clientUrl = ''
let _clientKey = ''

export function getSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!url || !key) return null
  if (_client && _clientUrl === url && _clientKey === key) return _client
  _client = createClient(url, key)
  _clientUrl = url
  _clientKey = key
  return _client
}

export function isSupabaseConfigured(settings: AppSettings): boolean {
  return Boolean(settings.supabaseUrl?.trim() && settings.supabaseAnonKey?.trim())
}

// ─── Keep-alive ping ──────────────────────────────────────────────────────
// Free Supabase projects pause after 7 days with no activity. Pinging the DB
// with a trivial query once a day (while the app is open) keeps it active.

const KEEP_ALIVE_STORAGE_KEY = 'supabaseLastPingAt'
const KEEP_ALIVE_MIN_INTERVAL_MS = 23 * 60 * 60 * 1000 // 23 hours

export async function pingSupabaseKeepAlive(settings: AppSettings): Promise<void> {
  const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!supabase) return

  const lastPing = Number(localStorage.getItem(KEEP_ALIVE_STORAGE_KEY) || 0)
  if (Date.now() - lastPing < KEEP_ALIVE_MIN_INTERVAL_MS) return

  try {
    await supabase.from('ingredients').select('id', { count: 'exact', head: true }).limit(1)
    localStorage.setItem(KEEP_ALIVE_STORAGE_KEY, String(Date.now()))
  } catch {
    // Ignore failures — will retry next time the app opens
  }
}

// ─── SQL Setup Script (shown to user in the Cloud Sync UI) ──────────────────

export const SUPABASE_SETUP_SQL = `-- Run this in your Supabase SQL editor (Database → SQL Editor → New Query)

create table if not exists ingredients (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists ingredients_code_idx on ingredients (household_code);

create table if not exists recipes (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists recipes_code_idx on recipes (household_code);

create table if not exists meal_plans (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists meal_plans_code_idx on meal_plans (household_code);

create table if not exists grocery_lists (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists grocery_lists_code_idx on grocery_lists (household_code);

create table if not exists household_items (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists household_items_code_idx on household_items (household_code);

create table if not exists collections (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists collections_code_idx on collections (household_code);

create table if not exists kitchen_references (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists kitchen_references_code_idx on kitchen_references (household_code);

create table if not exists sync_settings (
  id text primary key,
  household_code text not null,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists sync_settings_code_idx on sync_settings (household_code);

-- Enable Row Level Security and allow public access via anon key
alter table ingredients      enable row level security;
alter table recipes          enable row level security;
alter table meal_plans       enable row level security;
alter table grocery_lists    enable row level security;
alter table household_items  enable row level security;
alter table collections      enable row level security;
alter table kitchen_references enable row level security;
alter table sync_settings    enable row level security;

create policy if not exists "Public access" on ingredients      for all using (true) with check (true);
create policy if not exists "Public access" on recipes          for all using (true) with check (true);
create policy if not exists "Public access" on meal_plans       for all using (true) with check (true);
create policy if not exists "Public access" on grocery_lists    for all using (true) with check (true);
create policy if not exists "Public access" on household_items  for all using (true) with check (true);
create policy if not exists "Public access" on collections      for all using (true) with check (true);
create policy if not exists "Public access" on kitchen_references for all using (true) with check (true);
create policy if not exists "Public access" on sync_settings    for all using (true) with check (true);`

// ─── Auth migration SQL (Phase 1 + 2 — run once via Supabase SQL Editor) ────
// Tracked here (not just handed over in chat) so it's versioned alongside
// the app and reviewable later. This can't be run through the anon key —
// PostgREST doesn't expose DDL — so it has to go through the dashboard's
// SQL Editor by someone with real project access, once. See the "Known
// Outstanding Issues" section of the app reference doc for migration status
// and what Phase 3 (removing the legacy-code bridge clause) will look like.

export const AUTH_MIGRATION_SQL = `-- ============================================================================
-- Angelo Family Meal Planner — Auth Migration (Phase 1 + Phase 2 / bridge)
-- ============================================================================
-- Run this ENTIRE script once in Supabase Dashboard -> SQL Editor -> New Query.
--
-- What this does:
--   PART 1 — creates two new tables (households, household_members) and two
--            new functions (create_household, join_household_by_code). This
--            part touches nothing existing — pure addition, zero behavior
--            change for any current device or user.
--   PART 2 — replaces the current wide-open "using (true)" policies on your
--            8 data tables with policies that require either (a) real
--            per-user auth + household membership, OR (b) the literal
--            current household code 'Angelo-family-2026' as a temporary bridge.
--            The bridge clause means EVERY existing device/user keeps
--            working exactly as before, with zero interruption, for as
--            long as it stays in place.
--
-- What this does NOT do yet:
--   It does not remove the bridge clause, so the security gap (anyone with
--   the anon key + code has access) is NOT closed by running this script.
--   That's Phase 3 — a separate, short script to run only after you've
--   signed up, created/joined the real household as its owner through the
--   app's new UI, and confirmed you can read/write your real data through
--   the NEW auth path. Phase 3 will be handed to you once that's verified.
--
-- Safe to run now. Nothing in this script can lock you out of your current
-- data — the bridge clause guarantees that.
-- ============================================================================


-- ── PART 1: New schema ──────────────────────────────────────────────────────

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'contributor', 'readonly')),
  -- auth.users isn't exposed via the API and cross-user reads of it would be
  -- blocked by RLS anyway even if it were — rather than adding a whole
  -- separate profiles table + a trigger to keep it in sync, the member list
  -- just needs *something* human-readable, so the client passes its own
  -- user's display label (their email) at create/join time and it's stored
  -- directly here. Not kept in sync with account changes, but simple.
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table households enable row level security;
alter table household_members enable row level security;

drop policy if exists "members can read their households" on households;
create policy "members can read their households" on households
  for select using (
    id in (select household_id from household_members where user_id = auth.uid())
  );

drop policy if exists "members can read their membership rows" on household_members;
create policy "members can read their membership rows" on household_members
  for select using (
    household_id in (select household_id from household_members where user_id = auth.uid())
  );

drop policy if exists "owners update members" on household_members;
create policy "owners update members" on household_members
  for update using (
    household_id in (select household_id from household_members where user_id = auth.uid() and role = 'owner')
  );

drop policy if exists "owners remove members or self leave" on household_members;
create policy "owners remove members or self leave" on household_members
  for delete using (
    household_id in (select household_id from household_members where user_id = auth.uid() and role = 'owner')
    or user_id = auth.uid()
  );

-- Deliberately no INSERT policy on households or household_members for
-- regular authenticated clients — the two functions below are the ONLY way
-- to create a household or join one, so a user can never grant themselves
-- (or anyone else) membership/ownership of a household directly.

create or replace function create_household(p_code text, p_name text, p_display_name text)
returns table(household_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  insert into households (code, name, created_by)
  values (p_code, p_name, auth.uid())
  returning id into v_id;

  insert into household_members (household_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'owner', p_display_name);

  return query select v_id;
end;
$$;
revoke all on function create_household(text, text, text) from public;
grant execute on function create_household(text, text, text) to authenticated;

create or replace function join_household_by_code(p_code text, p_display_name text)
returns table(household_id uuid, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select id into v_id from households where code = p_code;
  if v_id is null then
    raise exception 'No household found for that code';
  end if;

  insert into household_members (household_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'contributor', p_display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;

  return query select hm.household_id, hm.role from household_members hm
    where hm.household_id = v_id and hm.user_id = auth.uid();
end;
$$;
revoke all on function join_household_by_code(text, text) from public;
grant execute on function join_household_by_code(text, text) to authenticated;


-- ── PART 2: Bridge policies on the 8 existing data tables ──────────────────
-- Each table gets 4 separate policies (select/insert/update/delete) rather
-- than one combined policy, specifically so a 'readonly' member is blocked
-- from insert/update/delete but still allowed to select — a single FOR ALL
-- policy can't distinguish that correctly for DELETE (which has no WITH
-- CHECK clause to gate on).
${['ingredients', 'recipes', 'meal_plans', 'grocery_lists', 'household_items', 'collections', 'kitchen_references', 'sync_settings'].map(table => `
-- ${table}
drop policy if exists "Public access" on ${table};
drop policy if exists "select: legacy code or member" on ${table};
drop policy if exists "insert: legacy code or writable member" on ${table};
drop policy if exists "update: legacy code or writable member" on ${table};
drop policy if exists "delete: legacy code or writable member" on ${table};

create policy "select: legacy code or member" on ${table}
  for select using (
    household_code = 'Angelo-family-2026'
    or household_code in (
      select h.code from households h
      join household_members hm on hm.household_id = h.id
      where hm.user_id = auth.uid()
    )
  );

create policy "insert: legacy code or writable member" on ${table}
  for insert with check (
    household_code = 'Angelo-family-2026'
    or household_code in (
      select h.code from households h
      join household_members hm on hm.household_id = h.id
      where hm.user_id = auth.uid() and hm.role != 'readonly'
    )
  );

create policy "update: legacy code or writable member" on ${table}
  for update
  using (
    household_code = 'Angelo-family-2026'
    or household_code in (
      select h.code from households h
      join household_members hm on hm.household_id = h.id
      where hm.user_id = auth.uid() and hm.role != 'readonly'
    )
  )
  with check (
    household_code = 'Angelo-family-2026'
    or household_code in (
      select h.code from households h
      join household_members hm on hm.household_id = h.id
      where hm.user_id = auth.uid() and hm.role != 'readonly'
    )
  );

create policy "delete: legacy code or writable member" on ${table}
  for delete using (
    household_code = 'Angelo-family-2026'
    or household_code in (
      select h.code from households h
      join household_members hm on hm.household_id = h.id
      where hm.user_id = auth.uid() and hm.role != 'readonly'
    )
  );`).join('\n')}

-- ============================================================================
-- End of script. Once this runs cleanly, let Claude know and testing can
-- proceed against a disposable household code — your real data and its
-- access stays exactly as it is today until Phase 3 is deliberately run.
-- ============================================================================`

// ─── Auth migration fix (recursion bug — run once, after AUTH_MIGRATION_SQL) ─
// The disposable-account test pass caught a real bug: policies on
// household_members (and the 8 data tables, which query household_members
// inside their own policies) subqueried household_members directly from
// within its own RLS policy — Postgres can't evaluate that without recursing
// into itself, so every read/write through the new auth path failed with
// "infinite recursion detected in policy for relation household_members"
// (42P17). Fix: SECURITY DEFINER helper functions — a security-definer
// function owned by the table owner bypasses that table's own RLS when
// querying it internally (Postgres only enforces RLS against the table
// owner if FORCE ROW LEVEL SECURITY was set, which this migration never
// set), so calling the function from a policy's USING/WITH CHECK clause
// reads household_members exactly once, in a privileged context, without
// re-triggering RLS on itself. Standard, documented pattern for this exact
// problem.

export const AUTH_MIGRATION_FIX_SQL = `-- ============================================================================
-- Angelo Family Meal Planner — Auth Migration FIX (recursion bug)
-- ============================================================================
-- Run this once, AFTER the Phase 1+2 script (AUTH_MIGRATION_SQL). Nothing
-- about your real data changes here — this only replaces the policy logic,
-- using the same bridge (legacy code OR real membership) as before.
-- ============================================================================

create or replace function is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

create or replace function is_household_owner(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from household_members
    where household_id = p_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function is_member_of_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from households h
    join household_members hm on hm.household_id = h.id
    where h.code = p_code and hm.user_id = auth.uid()
  );
$$;

create or replace function is_writable_member_of_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from households h
    join household_members hm on hm.household_id = h.id
    where h.code = p_code and hm.user_id = auth.uid() and hm.role != 'readonly'
  );
$$;

revoke all on function is_household_member(uuid) from public;
revoke all on function is_household_owner(uuid) from public;
revoke all on function is_member_of_code(text) from public;
revoke all on function is_writable_member_of_code(text) from public;
grant execute on function is_household_member(uuid) to authenticated, anon;
grant execute on function is_household_owner(uuid) to authenticated, anon;
grant execute on function is_member_of_code(text) to authenticated, anon;
grant execute on function is_writable_member_of_code(text) to authenticated, anon;


-- ── Re-create household_members' own policies using the helper functions ───

drop policy if exists "members can read their households" on households;
create policy "members can read their households" on households
  for select using (is_household_member(id));

drop policy if exists "members can read their membership rows" on household_members;
create policy "members can read their membership rows" on household_members
  for select using (is_household_member(household_id));

drop policy if exists "owners update members" on household_members;
create policy "owners update members" on household_members
  for update using (is_household_owner(household_id));

drop policy if exists "owners remove members or self leave" on household_members;
create policy "owners remove members or self leave" on household_members
  for delete using (
    is_household_owner(household_id)
    or user_id = auth.uid()
  );


-- ── Re-create the 8 data-table policies using the helper functions ─────────
${['ingredients', 'recipes', 'meal_plans', 'grocery_lists', 'household_items', 'collections', 'kitchen_references', 'sync_settings'].map(table => `
-- ${table}
drop policy if exists "select: legacy code or member" on ${table};
drop policy if exists "insert: legacy code or writable member" on ${table};
drop policy if exists "update: legacy code or writable member" on ${table};
drop policy if exists "delete: legacy code or writable member" on ${table};

create policy "select: legacy code or member" on ${table}
  for select using (
    household_code = 'Angelo-family-2026'
    or is_member_of_code(household_code)
  );

create policy "insert: legacy code or writable member" on ${table}
  for insert with check (
    household_code = 'Angelo-family-2026'
    or is_writable_member_of_code(household_code)
  );

create policy "update: legacy code or writable member" on ${table}
  for update
  using (
    household_code = 'Angelo-family-2026'
    or is_writable_member_of_code(household_code)
  )
  with check (
    household_code = 'Angelo-family-2026'
    or is_writable_member_of_code(household_code)
  );

create policy "delete: legacy code or writable member" on ${table}
  for delete using (
    household_code = 'Angelo-family-2026'
    or is_writable_member_of_code(household_code)
  );`).join('\n')}

-- ============================================================================
-- End of fix. Once this runs cleanly, let Claude know and the disposable-
-- account test pass will be re-run in full.
-- ============================================================================`

// ─── Auth migration fix 2 (missing table grants — run after the fix above) ──
// A second real bug the disposable-account test pass caught: the
// `authenticated` Postgres role never had baseline SELECT/INSERT/UPDATE/
// DELETE grants on any of these tables — only `anon` did. RLS policies only
// get evaluated after a basic table-level GRANT check passes, so every
// authenticated request was denied with "permission denied for table X"
// before policy content was ever considered — independent of the recursion
// bug above. This is why the original wide-open setup always worked
// (unauthenticated requests run as `anon`, which already had the grant) but
// nothing worked once a real user actually signed in.

export const AUTH_MIGRATION_FIX2_SQL = `-- ============================================================================
-- Angelo Family Meal Planner — Auth Migration FIX 2 (missing table grants)
-- ============================================================================
-- Run this once, after the recursion fix. Safe to run now — a GRANT only
-- ADDS a capability that RLS still gates per-row; it doesn't loosen anything
-- the policies already restrict (household_members still has no INSERT
-- policy at all, so granting INSERT privilege there does not make direct
-- inserts possible — RLS still denies by default when no policy exists for
-- that command, which is the actual mechanism keeping membership creation
-- RPC-only).
-- ============================================================================

grant select, insert, update, delete on households to authenticated, anon;
grant select, insert, update, delete on household_members to authenticated, anon;
grant select, insert, update, delete on ingredients to authenticated, anon;
grant select, insert, update, delete on recipes to authenticated, anon;
grant select, insert, update, delete on meal_plans to authenticated, anon;
grant select, insert, update, delete on grocery_lists to authenticated, anon;
grant select, insert, update, delete on household_items to authenticated, anon;
grant select, insert, update, delete on collections to authenticated, anon;
grant select, insert, update, delete on kitchen_references to authenticated, anon;
grant select, insert, update, delete on sync_settings to authenticated, anon;

-- ============================================================================
-- End of fix. Once this runs cleanly, let Claude know and the disposable-
-- account test pass will be re-run in full.
-- ============================================================================`

// ─── Auth migration fix 3 (ambiguous column reference) ─────────────────────
// A third real bug the disposable-account test pass caught:
// join_household_by_code's `RETURNS TABLE(household_id uuid, role text)`
// implicitly creates PL/pgSQL output variables of the same names, which
// then collide with the real column names inside the function body —
// specifically inside the `ON CONFLICT (household_id, user_id)` clause,
// where Postgres can no longer tell whether `household_id` means the table
// column or the output variable. Every join attempt failed with "column
// reference \"household_id\" is ambiguous" (42702). create_household
// doesn't hit this (no ON CONFLICT clause), so it's untouched. Fix: rename
// the RETURNS TABLE output columns so there's no collision at all — the
// client (see joinHouseholdByCode in db/auth.ts) reads out_household_id/
// out_role accordingly.

export const AUTH_MIGRATION_FIX3_SQL = `-- ============================================================================
-- Angelo Family Meal Planner — Auth Migration FIX 3 (ambiguous column bug)
-- ============================================================================
-- Run this once. Safe to run now.
-- ============================================================================

-- CREATE OR REPLACE can't change a function's return type — and renaming the
-- RETURNS TABLE output columns counts as a return-type change even though
-- the parameter list is identical — so the old version has to be dropped
-- first. Dropping also wipes its EXECUTE grant, hence the re-grant at the end.
drop function if exists join_household_by_code(text, text);

create function join_household_by_code(p_code text, p_display_name text)
returns table(out_household_id uuid, out_role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Must be signed in';
  end if;

  select id into v_id from households where code = p_code;
  if v_id is null then
    raise exception 'No household found for that code';
  end if;

  insert into household_members (household_id, user_id, role, display_name)
  values (v_id, auth.uid(), 'contributor', p_display_name)
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;

  return query select hm.household_id, hm.role from household_members hm
    where hm.household_id = v_id and hm.user_id = auth.uid();
end;
$$;

revoke all on function join_household_by_code(text, text) from public;
grant execute on function join_household_by_code(text, text) to authenticated;

-- ============================================================================
-- End of fix. Once this runs cleanly, let Claude know and the disposable-
-- account test pass will be re-run in full.
-- ============================================================================`

// ─── Generate a memorable sync code ─────────────────────────────────────────

const ADJECTIVES = ['happy', 'sunny', 'quick', 'bright', 'calm', 'brave', 'cool', 'wise', 'nice', 'bold']
const NOUNS = ['apple', 'table', 'river', 'garden', 'family', 'kitchen', 'meadow', 'bridge', 'market', 'pantry']

export function generateSyncCode(householdName?: string): string {
  const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  const num  = Math.floor(Math.random() * 9000) + 1000
  const base = householdName?.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ''
  return base ? `${base}-${adj}-${num}` : `${adj}-${noun}-${num}`
}

// ─── Sync helpers ────────────────────────────────────────────────────────────

// PostgREST caps an unpaginated select at its default row limit (1000 on
// this project) — for a household with more rows than that (this one has
// 6,500+ ingredients), an unpaginated fetch silently returns only a partial,
// arbitrarily-ordered slice. That's not just an efficiency concern: every
// duplicate check in this file (push and pull alike) depends on seeing the
// cloud's *complete* current name index, so a truncated fetch here means
// name collisions past row 1000 go undetected — which was actively caught
// reproducing this exact bug during testing. Always page through everything.
async function fetchCloudRows(supabase: SupabaseClient, table: string, code: string): Promise<CloudRow[]> {
  const pageSize = 1000
  const all: CloudRow[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('household_code', code)
      .order('id')
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`Supabase fetch error (${table}): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as CloudRow[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

async function upsertCloudRow(supabase: SupabaseClient, table: string, code: string, id: string, data: unknown, updatedAt: string) {
  const { error } = await supabase
    .from(table)
    .upsert({ id, household_code: code, data, updated_at: updatedAt }, { onConflict: 'id' })
  if (error) throw new Error(`Supabase upsert error (${table}): ${error.message}`)
}

async function deleteCloudRow(supabase: SupabaseClient, table: string, code: string, id: string) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('household_code', code)
  if (error) throw new Error(`Supabase delete error (${table}): ${error.message}`)
}

// Strips cost/store fields for Family Share sync
function stripCostData(ingredient: Ingredient): Ingredient {
  return {
    ...ingredient,
    variants: ingredient.variants.map(v => ({
      ...v,
      packageCost: undefined,
      totalServingsInPackage: undefined,
      costPerServing: undefined,
      store: undefined,
    })),
  }
}

// Generic push/pull/merge for stores keyed by id (or any unique string), using
// newest-timestamp-wins merge logic. Ingredients and recipes use their own
// variant of this (below) because they also need name-based duplicate detection.
async function syncStore<T>(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
  table: string,
  localItems: T[],
  getKey: (item: T) => string | undefined,
  getUpdatedAt: (item: T) => string | undefined,
  saveItem: (item: T) => Promise<void>,
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0 }
  const localMap = new Map(localItems.map(i => [getKey(i), i]))

  if (direction !== 'pull') {
    for (const item of localItems) {
      const key = getKey(item)
      if (!key) continue
      await upsertCloudRow(supabase, table, code, key, item, getUpdatedAt(item) || new Date().toISOString())
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    const cloudRows = await fetchCloudRows(supabase, table, code)
    for (const row of cloudRows) {
      const cloudItem = row.data as T
      const key = getKey(cloudItem)
      if (!key) continue

      const local = localMap.get(key)
      if (!local) {
        await saveItem(cloudItem)
        result.addedLocally++
      } else {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(getUpdatedAt(local) || 0).getTime()
        if (cloudTime > localTime) {
          await saveItem(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
}

// ─── Main sync functions ─────────────────────────────────────────────────────

export async function syncIngredients(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
  familyShare = false,
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer' | 'duplicatesForReview'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [] as SyncDuplicate[] }

  const localItems = await getAllIngredients(true)
  const localMap = new Map(localItems.map(i => [i.id, i]))
  const localNameMap = new Map(localItems.map(i => [i.name.toLowerCase().trim(), i]))

  // Fetched once and reused by both directions. Pushing needs the cloud's
  // current state up front — a push that upserts blindly, without checking
  // whether the cloud already has this name under a different id, is exactly
  // how duplicate rows kept reappearing even after a full cloud cleanup: any
  // device pushing its own independently-created ingredients would silently
  // recreate the same duplicate-name groups the cleanup had just removed.
  const cloudRows = await fetchCloudRows(supabase, 'ingredients', code)
  const cloudIdSet = new Set(cloudRows.map(r => r.id))
  const cloudNameMap = new Map<string, CloudRow>()
  for (const row of cloudRows) {
    const name = ((row.data as Ingredient)?.name ?? '').toLowerCase().trim()
    if (name && !cloudNameMap.has(name)) cloudNameMap.set(name, row)
  }

  // Tracks local ids already routed to duplicatesForReview so a 'both' sync
  // doesn't flag the same local/cloud collision twice (once discovered while
  // deciding whether to push, once again while deciding whether to pull).
  const flaggedLocalIds = new Set<string>()

  if (direction !== 'pull') {
    // Push local → cloud
    for (const item of localItems) {
      if (!cloudIdSet.has(item.id)) {
        const nameMatch = cloudNameMap.get(item.name.toLowerCase().trim())
        if (nameMatch && nameMatch.id !== item.id) {
          // Pushing this would create a second cloud row for the same
          // ingredient under a different id — flag it for review instead,
          // the same way an incoming duplicate is flagged on pull, so it
          // goes through the same resolution path (which repoints recipe
          // references) rather than silently duplicating.
          result.duplicatesForReview.push({ type: 'ingredient', localItem: item, cloudItem: nameMatch.data as Ingredient })
          flaggedLocalIds.add(item.id)
          continue
        }
      }
      const toUpload = familyShare ? stripCostData(item) : item
      await upsertCloudRow(supabase, 'ingredients', code, item.id, toUpload, item.updatedAt)
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    // Pull cloud → local
    for (const row of cloudRows) {
      const cloudItem = row.data as Ingredient
      if (!cloudItem?.id) continue

      const local = localMap.get(cloudItem.id)
      if (!local) {
        // Check for name duplicate (same name, different ID)
        const nameDup = localNameMap.get(cloudItem.name?.toLowerCase().trim() ?? '')
        if (nameDup && nameDup.id !== cloudItem.id) {
          if (!flaggedLocalIds.has(nameDup.id)) {
            result.duplicatesForReview.push({ type: 'ingredient', localItem: nameDup, cloudItem })
            flaggedLocalIds.add(nameDup.id)
          }
        } else {
          await saveIngredient(cloudItem)
          result.addedLocally++
        }
      } else {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(local.updatedAt).getTime()
        if (cloudTime > localTime) {
          await saveIngredient(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
}

export async function syncRecipes(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<Pick<SyncSummary, 'addedLocally' | 'uploadedToCloud' | 'updatedToNewer' | 'duplicatesForReview'>> {
  const result = { addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [] as SyncDuplicate[] }

  const localItems = await getAllRecipes(true)
  const localMap = new Map(localItems.map(r => [r.id, r]))
  const localNameMap = new Map(localItems.map(r => [r.name.toLowerCase().trim(), r]))

  // See syncIngredients() above for why this is fetched once up front and
  // consulted before pushing — a push that skips this check is exactly how
  // duplicate rows kept reappearing even after a full cloud cleanup.
  const cloudRows = await fetchCloudRows(supabase, 'recipes', code)
  const cloudIdSet = new Set(cloudRows.map(r => r.id))
  const cloudNameMap = new Map<string, CloudRow>()
  for (const row of cloudRows) {
    const name = ((row.data as Recipe)?.name ?? '').toLowerCase().trim()
    if (name && !cloudNameMap.has(name)) cloudNameMap.set(name, row)
  }
  const flaggedLocalIds = new Set<string>()

  if (direction !== 'pull') {
    for (const item of localItems) {
      if (!cloudIdSet.has(item.id)) {
        const nameMatch = cloudNameMap.get(item.name.toLowerCase().trim())
        if (nameMatch && nameMatch.id !== item.id) {
          result.duplicatesForReview.push({ type: 'recipe', localItem: item, cloudItem: nameMatch.data as Recipe })
          flaggedLocalIds.add(item.id)
          continue
        }
      }
      await upsertCloudRow(supabase, 'recipes', code, item.id, item, item.updatedAt)
      result.uploadedToCloud++
    }
  }

  if (direction !== 'push') {
    for (const row of cloudRows) {
      const cloudItem = row.data as Recipe
      if (!cloudItem?.id) continue

      const local = localMap.get(cloudItem.id)
      if (!local) {
        const nameDup = localNameMap.get(cloudItem.name?.toLowerCase().trim() ?? '')
        if (nameDup && nameDup.id !== cloudItem.id) {
          if (!flaggedLocalIds.has(nameDup.id)) {
            result.duplicatesForReview.push({ type: 'recipe', localItem: nameDup, cloudItem })
            flaggedLocalIds.add(nameDup.id)
          }
        } else {
          await saveRecipe(cloudItem)
          result.addedLocally++
        }
      } else {
        const cloudTime = new Date(row.updated_at).getTime()
        const localTime = new Date(local.updatedAt).getTime()
        if (cloudTime > localTime) {
          await saveRecipe(cloudItem)
          result.updatedToNewer++
        }
      }
    }
  }

  return result
}

async function syncMealPlans(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const db = await getDB()
  const localDays = await db.getAll('mealPlanDays') as MealPlanDay[]
  return syncStore(
    supabase, code, direction, 'meal_plans', localDays,
    day => day.date,
    day => day.updatedAt,
    saveMealPlanDay,
  )
}

async function syncGroceryLists(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const db = await getDB()
  const localLists = await db.getAll('groceryLists') as GroceryList[]
  return syncStore(
    supabase, code, direction, 'grocery_lists', localLists,
    list => list.id,
    list => list.updatedAt || list.generatedAt,
    saveGroceryList,
  )
}

async function syncHouseholdItems(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const localItems = await getAllHouseholdItems()
  return syncStore<HouseholdItem>(
    supabase, code, direction, 'household_items', localItems,
    item => item.id,
    item => item.updatedAt || item.createdAt,
    saveHouseholdItem,
  )
}

async function syncCollections(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const localItems = await getAllCollections()
  return syncStore<RecipeCollection>(
    supabase, code, direction, 'collections', localItems,
    c => c.id,
    c => c.updatedAt,
    saveCollection,
  )
}

async function syncReferences(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
) {
  const localItems = await getAllReferences()
  return syncStore<KitchenReference>(
    supabase, code, direction, 'kitchen_references', localItems,
    r => r.id,
    r => r.updatedAt,
    saveReference,
  )
}

// Settings fields that are safe to share across a household — excludes API keys,
// theme, and other per-device/personal fields (see runSync for the full list).
const SYNCED_SETTINGS_KEYS = [
  'householdName', 'unitSystem', 'geminiModel', 'nutrientToggles', 'macroHistoryDays',
  'storePreferenceEnabled', 'householdSize', 'people', 'setupComplete',
  'ingredientCategories', 'recipeTags', 'brands', 'stores',
  'ingredientDisplay', 'allergenWatchList',
] as const

function pickSyncableSettings(settings: AppSettings): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of SYNCED_SETTINGS_KEYS) picked[key] = settings[key]
  picked.aiProvider = settings.ai.provider
  return picked
}

async function syncSettings(
  supabase: SupabaseClient,
  code: string,
  direction: 'both' | 'push' | 'pull',
): Promise<{ uploaded: number; downloaded: number }> {
  let uploaded = 0
  let downloaded = 0
  const local = await loadSettings()
  const rowId = `${code}:settings`

  if (direction !== 'pull') {
    await upsertCloudRow(supabase, 'sync_settings', code, rowId, pickSyncableSettings(local), local.updatedAt)
    uploaded = 1
  }

  if (direction !== 'push') {
    const rows = await fetchCloudRows(supabase, 'sync_settings', code)
    const row = rows.find(r => r.id === rowId)
    if (row) {
      const cloudTime = new Date(row.updated_at).getTime()
      const localTime = new Date(local.updatedAt || 0).getTime()
      if (cloudTime > localTime) {
        const cloud = row.data as Record<string, unknown>
        const patch: Partial<AppSettings> = {}
        for (const key of SYNCED_SETTINGS_KEYS) {
          if (key in cloud) (patch as Record<string, unknown>)[key] = cloud[key]
        }
        const merged: AppSettings = { ...local, ...patch }
        if (typeof cloud.aiProvider === 'string') {
          merged.ai = { ...local.ai, provider: cloud.aiProvider as AIProvider }
        }
        await saveSettingsWithTimestamp(merged, row.updated_at)
        downloaded = 1
      }
    }
  }

  return { uploaded, downloaded }
}

// ─── Full sync orchestration ─────────────────────────────────────────────────

export async function runSync(
  settings: AppSettings,
  direction: 'both' | 'push' | 'pull',
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    addedLocally: 0,
    uploadedToCloud: 0,
    updatedToNewer: 0,
    duplicatesForReview: [],
    errors: [],
  }

  const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!supabase) {
    summary.errors.push('Supabase is not configured. Add your URL and key in Settings → Integrations.')
    return summary
  }

  const code = settings.householdSyncCode?.trim()
  if (!code) {
    summary.errors.push('No Household Sync Code set. Create one in Settings → Data → Cloud Sync.')
    return summary
  }

  try {
    const ing = await syncIngredients(supabase, code, direction)
    summary.addedLocally    += ing.addedLocally
    summary.uploadedToCloud += ing.uploadedToCloud
    summary.updatedToNewer  += ing.updatedToNewer
    summary.duplicatesForReview.push(...ing.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Ingredients: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const rec = await syncRecipes(supabase, code, direction)
    summary.addedLocally    += rec.addedLocally
    summary.uploadedToCloud += rec.uploadedToCloud
    summary.updatedToNewer  += rec.updatedToNewer
    summary.duplicatesForReview.push(...rec.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Recipes: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const col = await syncCollections(supabase, code, direction)
    summary.addedLocally    += col.addedLocally
    summary.uploadedToCloud += col.uploadedToCloud
    summary.updatedToNewer  += col.updatedToNewer
  } catch (e) {
    summary.errors.push(`Recipe collections: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const refs = await syncReferences(supabase, code, direction)
    summary.addedLocally    += refs.addedLocally
    summary.uploadedToCloud += refs.uploadedToCloud
    summary.updatedToNewer  += refs.updatedToNewer
  } catch (e) {
    summary.errors.push(`Kitchen reference: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const mp = await syncMealPlans(supabase, code, direction)
    summary.addedLocally    += mp.addedLocally
    summary.uploadedToCloud += mp.uploadedToCloud
    summary.updatedToNewer  += mp.updatedToNewer
  } catch (e) {
    summary.errors.push(`Meal plans: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const gl = await syncGroceryLists(supabase, code, direction)
    summary.addedLocally    += gl.addedLocally
    summary.uploadedToCloud += gl.uploadedToCloud
    summary.updatedToNewer  += gl.updatedToNewer
  } catch (e) {
    summary.errors.push(`Grocery lists: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const hi = await syncHouseholdItems(supabase, code, direction)
    summary.addedLocally    += hi.addedLocally
    summary.uploadedToCloud += hi.uploadedToCloud
    summary.updatedToNewer  += hi.updatedToNewer
  } catch (e) {
    summary.errors.push(`Household items: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const st = await syncSettings(supabase, code, direction)
    summary.uploadedToCloud += st.uploaded
    summary.updatedToNewer  += st.downloaded
  } catch (e) {
    summary.errors.push(`Settings: ${e instanceof Error ? e.message : String(e)}`)
  }

  return summary
}

// ─── Family Share sync (recipes only, no cost/store data) ────────────────────

export async function runFamilyShareSync(
  settings: AppSettings,
  direction: 'both' | 'push' | 'pull',
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    addedLocally: 0,
    uploadedToCloud: 0,
    updatedToNewer: 0,
    duplicatesForReview: [],
    errors: [],
  }

  const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
  if (!supabase) {
    summary.errors.push('Supabase is not configured.')
    return summary
  }

  const shareCode = settings.familyShareCode?.trim()
  if (!shareCode) {
    summary.errors.push('No Family Share Code set.')
    return summary
  }

  const familyCode = `${shareCode}:family`

  if (settings.familyShareRole === 'readonly' && direction === 'push') {
    summary.errors.push('You are a read-only member. You cannot push to this family share.')
    return summary
  }

  try {
    const rec = await syncRecipes(supabase, familyCode, direction)
    summary.addedLocally    += rec.addedLocally
    summary.uploadedToCloud += rec.uploadedToCloud
    summary.updatedToNewer  += rec.updatedToNewer
    summary.duplicatesForReview.push(...rec.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Recipes: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    // Ingredients synced without cost data
    const ing = await syncIngredients(supabase, familyCode, direction, true)
    summary.addedLocally    += ing.addedLocally
    summary.uploadedToCloud += ing.uploadedToCloud
    summary.updatedToNewer  += ing.updatedToNewer
    summary.duplicatesForReview.push(...ing.duplicatesForReview)
  } catch (e) {
    summary.errors.push(`Ingredients: ${e instanceof Error ? e.message : String(e)}`)
  }

  return summary
}

// Repoints every recipe's ingredient reference from a losing ingredient id to the
// surviving one. Without this, resolving a duplicate (in either direction) leaves
// existing recipes pointing at an id that's about to be discarded, which is exactly
// how ingredients silently vanished from grocery lists (see consolidateIngredients).
async function repointIngredientId(fromId: string, toId: string): Promise<void> {
  const recipes = await getAllRecipes(true)
  for (const recipe of recipes) {
    let changed = false
    for (const ri of recipe.ingredients) {
      if (ri.ingredientId === fromId) {
        ri.ingredientId = toId
        changed = true
      }
    }
    if (changed) await saveRecipe(recipe)
  }
}

// Same idea for recipes: repoints meal plan slots and recipe collections so a
// discarded recipe id doesn't leave a meal plan or collection pointing at nothing.
async function repointRecipeId(fromId: string, toId: string): Promise<void> {
  const db = await getDB()
  const days = await db.getAll('mealPlanDays') as MealPlanDay[]
  for (const day of days) {
    let changed = false
    const slots = [day.meals.breakfast, day.meals.lunch, day.meals.dinner, day.meals.snacks, day.meals.drinks ?? []]
    for (const slot of slots) {
      for (const item of slot) {
        if (item.recipeId === fromId) {
          item.recipeId = toId
          changed = true
        }
        if (item.individualAssignments) {
          for (const personId of Object.keys(item.individualAssignments)) {
            if (item.individualAssignments[personId] === fromId) {
              item.individualAssignments[personId] = toId
              changed = true
            }
          }
        }
      }
    }
    if (changed) await saveMealPlanDay(day)
  }

  const collections = await getAllCollections()
  for (const c of collections) {
    if (c.recipeIds.includes(fromId)) {
      c.recipeIds = c.recipeIds.map(id => (id === fromId ? toId : id))
      await saveCollection(c)
    }
  }
}

// Re-export helpers needed in CloudSyncSection
//
// `settings` is needed for keep-local: a duplicate can now be discovered
// either on pull (an incoming cloud item collides with an existing local
// name) or on push (a local item was withheld from upload because the cloud
// already had this name under a different id). In the pull case "keep-local"
// simply means "ignore the incoming cloud item" — nothing local references
// it yet, so there's nothing to push. In the push case, though, the local
// item was never actually uploaded, and the cloud's competing row is still
// sitting there — so "keep-local" has to push the local item and retire the
// cloud's old row, or the same collision just gets flagged again next sync.
export async function resolveIngredientDuplicate(
  action: 'keep-local' | 'keep-cloud' | 'keep-both',
  dup: SyncDuplicate & { type: 'ingredient' },
  settings: AppSettings,
): Promise<void> {
  const local = dup.localItem as Ingredient
  const cloud = dup.cloudItem as Ingredient
  if (action === 'keep-cloud' || action === 'keep-both') {
    await saveIngredient(cloud)
  }
  if (action === 'keep-cloud') {
    await repointIngredientId(local.id, cloud.id)
    await deleteIngredient(local.id)
  } else if (action === 'keep-local') {
    await repointIngredientId(cloud.id, local.id)
    const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
    const code = settings.householdSyncCode?.trim()
    if (supabase && code) {
      await upsertCloudRow(supabase, 'ingredients', code, local.id, local, local.updatedAt)
      await deleteCloudRow(supabase, 'ingredients', code, cloud.id)
    }
  }
}

export async function resolveRecipeDuplicate(
  action: 'keep-local' | 'keep-cloud' | 'keep-both',
  dup: SyncDuplicate & { type: 'recipe' },
  settings: AppSettings,
): Promise<void> {
  const local = dup.localItem as Recipe
  const cloud = dup.cloudItem as Recipe
  if (action === 'keep-cloud' || action === 'keep-both') {
    await saveRecipe(cloud)
  }
  if (action === 'keep-cloud') {
    await repointRecipeId(local.id, cloud.id)
    await deleteRecipe(local.id)
  } else if (action === 'keep-local') {
    await repointRecipeId(cloud.id, local.id)
    const supabase = getSupabaseClient(settings.supabaseUrl, settings.supabaseAnonKey)
    const code = settings.householdSyncCode?.trim()
    if (supabase && code) {
      await upsertCloudRow(supabase, 'recipes', code, local.id, local, local.updatedAt)
      await deleteCloudRow(supabase, 'recipes', code, cloud.id)
    }
  }
}
