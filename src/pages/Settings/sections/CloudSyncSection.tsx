import { useState, useEffect, useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Button, Card, Input, Select, Modal, Toggle, OperationStatus } from '@/components/ui'
import type { OperationState, OperationProgress } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'
import {
  runSync, runFamilyShareSync, generateSyncCode,
  isSupabaseConfigured, SUPABASE_SETUP_SQL,
  AUTH_MIGRATION_SQL, AUTH_MIGRATION_FIX_SQL, AUTH_MIGRATION_FIX2_SQL, AUTH_MIGRATION_FIX3_SQL, AUTH_MIGRATION_FIX4_SQL,
  LATEST_MIGRATION_FIX_SQL,
  resolveIngredientDuplicate, resolveRecipeDuplicate,
  resolveIngredientCollision, resolveRecipeCollision,
  type SyncSummary, type SyncDuplicate, type SyncCollision,
} from '@/db/supabase'
import {
  createHousehold, joinHouseholdByCode, getMyHouseholds, getHouseholdMembers, updateMemberRole, removeMember,
  type HouseholdMembership, type HouseholdMemberRow, type MemberRole,
} from '@/db/auth'
import { encodeFamilyShareInvite, decodeFamilyShareInvite } from '@/utils/familyShareInvite'
import { AccountSection } from './AccountSection'
import { formatRelativeTime } from '@/utils/relativeTime'
import type { FamilyShareRole, Ingredient, Recipe } from '@/types'
import styles from './CloudSyncSection.module.css'

type SyncDirection = 'both' | 'push' | 'pull'

// "Full Setup" — five scripts, meant to be run back-to-back in this exact
// order in a fresh Supabase project with no existing schema (each was
// authored as a standalone patch on top of the last during live testing, and
// each says so in its own header comment). Concatenating them here — rather
// than hand-authoring one "final state" script — means what a new project
// runs is exactly what was actually tested, not a rewritten summary of it.
// Not for an already-migrated project — see "Latest Fix" below for that case.
const AUTH_SETUP_SQL_COMBINED = [
  AUTH_MIGRATION_SQL, AUTH_MIGRATION_FIX_SQL, AUTH_MIGRATION_FIX2_SQL, AUTH_MIGRATION_FIX3_SQL, AUTH_MIGRATION_FIX4_SQL,
].join('\n\n\n')

// ─── Family Share (Own-Household fix) ──────────────────────────────────────
// Deliberately NOT reusing AccountSection's getMyHouseholds()-driven
// HouseholdCard list — a family-share household must never be visually or
// structurally conflated with the household you actually live in (settled
// design decision). This component finds "its" household without any new
// household_type column: it looks up, among this signed-in account's real
// households, whichever one matches this device's own familyShareCode — the
// exact same canonical-code-lookup pattern useIsHouseholdOwner() already
// uses for Household Sync, just applied to a different settings field.
function FamilyShareSection({ url, anonKey }: { url: string; anonKey: string }) {
  const { settings, updateSettings } = useSettings()
  const { session, user, loading: authLoading } = useSupabaseAuth(url, anonKey)
  const [households, setHouseholds] = useState<HouseholdMembership[]>([])
  const [loadingHouseholds, setLoadingHouseholds] = useState(true)
  const [members, setMembers] = useState<HouseholdMemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinToken, setJoinToken] = useState('')
  const [inviteRole, setInviteRole] = useState<'contributor' | 'readonly'>('contributor')
  const [generatedInvite, setGeneratedInvite] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!session) { setHouseholds([]); setLoadingHouseholds(false); return [] as HouseholdMembership[] }
    setLoadingHouseholds(true)
    try {
      const list = await getMyHouseholds(url, anonKey)
      setHouseholds(list)
      return list
    } catch {
      // Same choice as AccountSection.tsx's refresh(): leave the previously-
      // loaded list as-is on a transient failure rather than clearing it.
      return [] as HouseholdMembership[]
    } finally {
      setLoadingHouseholds(false)
    }
  }, [url, anonKey, session])

  useEffect(() => { refresh() }, [refresh])

  const norm = (s: string) => s.trim().toLowerCase()
  const activeCode = settings.familyShareCode ? norm(settings.familyShareCode) : null
  const familyHousehold = activeCode ? households.find(h => norm(h.code) === activeCode) : undefined

  useEffect(() => {
    if (!familyHousehold) { setMembers([]); return }
    let cancelled = false
    setLoadingMembers(true)
    getHouseholdMembers(url, anonKey, familyHousehold.householdId).then(list => {
      if (!cancelled) { setMembers(list); setLoadingMembers(false) }
    })
    return () => { cancelled = true }
  }, [familyHousehold?.householdId, url, anonKey])

  async function handleCreate() {
    setCreating(true)
    setError('')
    const code = settings.familyShareCode?.trim() || generateSyncCode()
    const result = await createHousehold(url, anonKey, code, `${settings.householdName || 'Family'} Share`, user?.email ?? '')
    setCreating(false)
    if (!result.ok) { setError(result.error ?? 'Could not create Family Share.'); return }
    await updateSettings({ familyShareCode: code, familyShareRole: 'owner' })
    await refresh()
  }

  function handleGenerateInvite() {
    if (!settings.familyShareCode) return
    setGeneratedInvite(encodeFamilyShareInvite(settings.familyShareCode, inviteRole))
  }

  async function handleJoin() {
    if (!joinToken.trim()) { setError('Paste the invite your family member sent you.'); return }
    const decoded = decodeFamilyShareInvite(joinToken)
    if (!decoded) { setError('That invite could not be read.'); return }
    setJoining(true)
    setError('')
    const result = await joinHouseholdByCode(url, anonKey, decoded.code, user?.email ?? '', decoded.role)
    setJoining(false)
    if (!result.ok) { setError(result.error ?? 'Could not join that Family Share.'); return }
    const resolvedRole = (result.role as FamilyShareRole | undefined) ?? decoded.role ?? 'contributor'
    await updateSettings({ familyShareCode: decoded.code, familyShareRole: resolvedRole })
    setJoinToken('')
    await refresh()
  }

  async function handleRoleChange(userId: string, role: MemberRole) {
    if (!familyHousehold) return
    await updateMemberRole(url, anonKey, familyHousehold.householdId, userId, role)
    setMembers(await getHouseholdMembers(url, anonKey, familyHousehold.householdId))
  }

  async function handleRemoveMember(userId: string) {
    if (!familyHousehold) return
    await removeMember(url, anonKey, familyHousehold.householdId, userId)
    setMembers(await getHouseholdMembers(url, anonKey, familyHousehold.householdId))
  }

  if (authLoading || loadingHouseholds) {
    return <Card padding="md"><p className={styles.desc}>Checking Family Share status…</p></Card>
  }

  if (!session) {
    return (
      <Card padding="md">
        <p className={styles.desc}>
          Sign in above (Account) to set up Family Share — every participant now needs a real account,
          a change from how this used to work.
        </p>
      </Card>
    )
  }

  return (
    <Card padding="md">
      {error && <p className={styles.syncError}>{error}</p>}

      {!familyHousehold ? (
        <>
          <p className={styles.desc}>You haven't set up a Family Share yet.</p>
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : '+ Create a Family Share'}
          </Button>
          <div className={styles.codeRow} style={{ marginTop: 'var(--space-3)' }}>
            <Input
              label="Or join one with an invite"
              value={joinToken}
              onChange={e => setJoinToken(e.target.value)}
              placeholder="Paste the invite your family member sent you"
            />
            <Button size="sm" variant="secondary" className={styles.genBtn} onClick={handleJoin} disabled={joining}>
              {joining ? 'Joining…' : 'Join'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.desc}>
            Family Share code: <strong>{familyHousehold.code}</strong> — your role: <strong>{familyHousehold.role}</strong>
          </p>

          {familyHousehold.role === 'owner' && (
            <>
              <div className={styles.codeRow}>
                <Select
                  label="Role for the next invite"
                  options={[
                    { value: 'contributor', label: 'Contributor (can push and pull)' },
                    { value: 'readonly', label: 'Read Only (can only pull)' },
                  ]}
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as 'contributor' | 'readonly')}
                />
                <Button size="sm" variant="secondary" className={styles.genBtn} onClick={handleGenerateInvite}>
                  Generate Invite
                </Button>
              </div>
              {generatedInvite && (
                <Input label="Share this with your family member" value={generatedInvite} readOnly onFocus={e => e.target.select()} />
              )}

              <div style={{ marginTop: 'var(--space-3)' }}>
                <span className={styles.subTitle}>Members</span>
                {loadingMembers ? <p className={styles.desc}>Loading members…</p> : members.map(m => (
                  <div key={m.userId} className={styles.codeRow}>
                    <span>{m.displayName || m.userId}</span>
                    {m.role === 'owner' ? (
                      <span>{m.role}</span>
                    ) : (
                      <>
                        <Select
                          options={[
                            { value: 'contributor', label: 'Contributor' },
                            { value: 'readonly', label: 'Read Only' },
                          ]}
                          value={m.role}
                          onChange={e => handleRoleChange(m.userId, e.target.value as MemberRole)}
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveMember(m.userId)}>Remove</Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}

export function CloudSyncSection() {
  const { settings, updateSettings, reloadSettings } = useSettings()
  const [familySyncState, setFamilySyncState] = useState<OperationState>('idle')
  const [familySyncProgress, setFamilySyncProgress] = useState<OperationProgress | undefined>(undefined)
  const familySyncing = familySyncState === 'working'
  const [summary, setSummary] = useState<SyncSummary | null>(null)
  const [familySummary, setFamilySummary] = useState<SyncSummary | null>(null)
  // Household Sync's shared status/progress surface — see OPERATION_FEEDBACK_STANDARD.md
  // and OperationStatus (src/components/ui). Family Share now mirrors this exact
  // state-machine shape via familySyncState/familySyncProgress above.
  const [syncState, setSyncState] = useState<OperationState>('idle')
  const [syncProgress, setSyncProgress] = useState<OperationProgress | undefined>(undefined)
  const syncing = syncState === 'working'
  const [showSQL, setShowSQL] = useState(false)
  const [showAuthSQL, setShowAuthSQL] = useState(false)
  const [showLatestFixSQL, setShowLatestFixSQL] = useState(false)
  const [dupToResolve, setDupToResolve] = useState<SyncDuplicate | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveError, setResolveError] = useState('')
  const [collisionToResolve, setCollisionToResolve] = useState<SyncCollision | null>(null)
  const [collisionResolving, setCollisionResolving] = useState(false)
  const [collisionResolveError, setCollisionResolveError] = useState('')

  // "X ago" only recomputes on render — tick every minute so it doesn't read
  // "just now" for the whole time this section happens to stay open.
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const configured = isSupabaseConfigured(settings)

  async function handleSync(direction: SyncDirection) {
    // Flips synchronously, before the first `await` — the status region
    // appears on the very next paint, well inside the 200-300ms bar
    // OPERATION_FEEDBACK_STANDARD.md sets for "did my click register."
    setSyncState('working')
    setSyncProgress(undefined)
    setSummary(null)
    try {
      const result = await runSync(settings, direction, update => setSyncProgress(update))
      setSummary(result)
      // Only stamp "last synced" on a clean run — a sync that errored didn't
      // actually reconcile anything, so it shouldn't read as up to date.
      if (result.errors.length === 0) {
        setSyncState('done')
        await updateSettings({ lastHouseholdSyncAt: new Date().toISOString() })
      } else {
        setSyncState('failed')
      }
      // Settings may have been written directly to IndexedDB during sync — refresh context state
      await reloadSettings()
    } catch (e) {
      setSummary({ addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [], collisionsForReview: [], errors: [e instanceof Error ? e.message : String(e)] })
      setSyncState('failed')
    }
  }

  // OperationStatus's success text is real numbers per the standard's
  // success-state rule, not a bare "Done!" — matches the wording this app
  // already used before this component existed, so a returning user sees
  // the same familiar phrasing, just inside the new shared surface.
  function buildSyncDoneMessage(s: SyncSummary): string {
    const hasActivity = s.addedLocally + s.uploadedToCloud + s.updatedToNewer > 0
    const hasDups = s.duplicatesForReview.length > 0
    const hasCollisions = s.collisionsForReview.length > 0
    const base = `${s.addedLocally} new ${s.addedLocally === 1 ? 'item' : 'items'} added from cloud, ` +
      `${s.uploadedToCloud} ${s.uploadedToCloud === 1 ? 'item' : 'items'} uploaded, ` +
      `${s.updatedToNewer} updated to newer version.`
    return !hasActivity && !hasDups && !hasCollisions ? `${base} Everything is already up to date.` : base
  }

  // Error-state minimum bar per the standard: what happened, how much
  // succeeded first, one plain-language next step — runSync's per-store
  // try/catch means "failed" here can still mean several stores succeeded
  // before/around the ones that errored, so that's surfaced explicitly
  // rather than implying nothing happened.
  function buildSyncErrorMessage(s: SyncSummary): string {
    const succeeded = s.addedLocally + s.uploadedToCloud + s.updatedToNewer
    const succeededNote = succeeded > 0 ? ` ${succeeded} item${succeeded === 1 ? '' : 's'} synced successfully despite this.` : ''
    return `${s.errors.join(' ')}${succeededNote} You can retry — already-synced items won't be duplicated.`
  }

  async function handleFamilySync(direction: SyncDirection) {
    setFamilySyncState('working')
    setFamilySyncProgress(undefined)
    setFamilySummary(null)
    try {
      const result = await runFamilyShareSync(settings, direction, update => setFamilySyncProgress(update))
      setFamilySummary(result)
      if (result.errors.length === 0) {
        setFamilySyncState('done')
        await updateSettings({ lastFamilySyncAt: new Date().toISOString() })
      } else {
        setFamilySyncState('failed')
      }
    } catch (e) {
      setFamilySummary({ addedLocally: 0, uploadedToCloud: 0, updatedToNewer: 0, duplicatesForReview: [], collisionsForReview: [], errors: [String(e)] })
      setFamilySyncState('failed')
    }
  }

  function handleGenerateHouseholdCode() {
    const code = generateSyncCode(settings.householdName)
    updateSettings({ householdSyncCode: code })
  }

  // resolveIngredientDuplicate() is now a genuinely atomic IndexedDB
  // transaction (2026-07-24 fix) — it can throw (e.g. a real transaction
  // failure) instead of silently doing nothing, so this needs real error
  // handling now, not just a bare await. Previously there was NO catch here
  // at all: a throw would have surfaced as an unhandled promise rejection
  // with zero user-visible feedback. On failure the modal stays open
  // (dupToResolve is not cleared) so the user can see the error and retry
  // or Skip, rather than the dialog silently vanishing either way.
  async function handleResolveDuplicate(action: 'keep-local' | 'keep-cloud' | 'keep-both') {
    if (!dupToResolve) return
    setResolving(true)
    setResolveError('')
    try {
      if (dupToResolve.type === 'ingredient') {
        await resolveIngredientDuplicate(action, dupToResolve as SyncDuplicate & { type: 'ingredient' }, settings)
      } else {
        await resolveRecipeDuplicate(action, dupToResolve as SyncDuplicate & { type: 'recipe' }, settings)
      }
      // Remove from the pending list
      if (summary) {
        setSummary({
          ...summary,
          duplicatesForReview: summary.duplicatesForReview.filter(d => d !== dupToResolve),
        })
      }
      setDupToResolve(null)
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'Could not resolve this duplicate — nothing was changed. Please try again.')
    } finally {
      setResolving(false)
    }
  }

  async function resolveOne(dup: SyncDuplicate, action: 'keep-local' | 'keep-cloud' | 'keep-newer'): Promise<'keep-local' | 'keep-cloud'> {
    const resolvedAction: 'keep-local' | 'keep-cloud' = action === 'keep-newer'
      ? (new Date(dup.cloudItem.updatedAt).getTime() > new Date(dup.localItem.updatedAt).getTime() ? 'keep-cloud' : 'keep-local')
      : action
    if (dup.type === 'ingredient') {
      await resolveIngredientDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'ingredient' }, settings)
    } else {
      await resolveRecipeDuplicate(resolvedAction, dup as SyncDuplicate & { type: 'recipe' }, settings)
    }
    return resolvedAction
  }

  function makeBulkResolver(setSummaryState: Dispatch<SetStateAction<SyncSummary | null>>) {
    return async function bulkResolve(
      dups: SyncDuplicate[],
      action: 'keep-local' | 'keep-cloud' | 'keep-newer',
    ): Promise<{ keptLocal: number; keptCloud: number }> {
      let keptLocal = 0
      let keptCloud = 0
      // Each item gets its own try/catch — a genuine transaction failure on
      // one duplicate must not abort resolving the rest of the batch, and
      // must not be silently swallowed either. Failed items stay in
      // duplicatesForReview (so they're visibly still pending, not lost)
      // and their errors are appended to the existing summary.errors list,
      // reusing the mechanism SyncResultDisplay already renders errors
      // through rather than adding a second, parallel error surface.
      const resolvedDups: SyncDuplicate[] = []
      const errors: string[] = []
      for (const dup of dups) {
        try {
          const resolvedAction = await resolveOne(dup, action)
          if (resolvedAction === 'keep-local') keptLocal++
          else keptCloud++
          resolvedDups.push(dup)
        } catch (e) {
          const name = (dup.localItem as { name?: string }).name ?? dup.type
          errors.push(`Could not resolve duplicate "${name}": ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const resolvedSet = new Set(resolvedDups)
      setSummaryState(prev => prev && {
        ...prev,
        duplicatesForReview: prev.duplicatesForReview.filter(d => !resolvedSet.has(d)),
        errors: errors.length > 0 ? [...prev.errors, ...errors] : prev.errors,
      })
      return { keptLocal, keptCloud }
    }
  }

  const bulkResolveHousehold = makeBulkResolver(setSummary)
  const bulkResolveFamily = makeBulkResolver(setFamilySummary)

  // Skip is a no-op here — it only removes the item from *this* summary's
  // review list. There's no persisted dismissal: if the same local item is
  // still in genuine conflict, it will be flagged as a new collision again
  // on a future sync. Distinct from resolveIngredientCollision/
  // resolveRecipeCollision (Push-as-New), which do real local+cloud writes.
  function handleSkipCollision() {
    if (!collisionToResolve) return
    if (summary) {
      setSummary({ ...summary, collisionsForReview: summary.collisionsForReview.filter(c => c !== collisionToResolve) })
    }
    if (familySummary) {
      setFamilySummary({ ...familySummary, collisionsForReview: familySummary.collisionsForReview.filter(c => c !== collisionToResolve) })
    }
    setCollisionToResolve(null)
    setCollisionResolveError('')
  }

  async function handleResolveCollision(action: 'skip' | 'push-as-new') {
    if (!collisionToResolve) return
    if (action === 'skip') { handleSkipCollision(); return }
    setCollisionResolving(true)
    setCollisionResolveError('')
    try {
      if (collisionToResolve.type === 'ingredient') {
        await resolveIngredientCollision(collisionToResolve as SyncCollision & { type: 'ingredient' }, settings)
      } else {
        await resolveRecipeCollision(collisionToResolve as SyncCollision & { type: 'recipe' }, settings)
      }
      if (summary) {
        setSummary({ ...summary, collisionsForReview: summary.collisionsForReview.filter(c => c !== collisionToResolve) })
      }
      if (familySummary) {
        setFamilySummary({ ...familySummary, collisionsForReview: familySummary.collisionsForReview.filter(c => c !== collisionToResolve) })
      }
      setCollisionToResolve(null)
    } catch (e) {
      setCollisionResolveError(e instanceof Error ? e.message : 'Could not push this item — nothing was changed. Please try again.')
    } finally {
      setCollisionResolving(false)
    }
  }

  function makeBulkCollisionResolver(setSummaryState: Dispatch<SetStateAction<SyncSummary | null>>) {
    return async function bulkResolveCollisions(
      collisions: SyncCollision[],
      action: 'skip' | 'push-as-new',
    ): Promise<{ skipped: number; pushed: number }> {
      let skipped = 0
      let pushed = 0
      const resolved: SyncCollision[] = []
      const errors: string[] = []
      for (const c of collisions) {
        if (action === 'skip') {
          skipped++
          resolved.push(c)
          continue
        }
        try {
          if (c.type === 'ingredient') {
            await resolveIngredientCollision(c as SyncCollision & { type: 'ingredient' }, settings)
          } else {
            await resolveRecipeCollision(c as SyncCollision & { type: 'recipe' }, settings)
          }
          pushed++
          resolved.push(c)
        } catch (e) {
          const name = (c.localItem as { name?: string }).name ?? c.type
          errors.push(`Could not push "${name}" as new: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      const resolvedSet = new Set(resolved)
      setSummaryState(prev => prev && {
        ...prev,
        collisionsForReview: prev.collisionsForReview.filter(c => !resolvedSet.has(c)),
        errors: errors.length > 0 ? [...prev.errors, ...errors] : prev.errors,
      })
      return { skipped, pushed }
    }
  }

  const bulkResolveHouseholdCollisions = makeBulkCollisionResolver(setSummary)
  const bulkResolveFamilyCollisions = makeBulkCollisionResolver(setFamilySummary)

  return (
    <div className={styles.syncSection}>
      <h2 className={styles.sectionTitle}>Cloud Sync</h2>

      {!configured && (
        <div className={styles.setupBanner}>
          <span className={styles.setupIcon}>☁️</span>
          <div>
            <p className={styles.setupTitle}>Cloud sync requires a free Supabase account</p>
            <p className={styles.setupDesc}>
              Supabase is a free service that stores your data in the cloud so you can access it from any device.
              Add your Supabase URL and key in <strong>Settings → Integrations</strong> to get started.
            </p>
            <button className={styles.sqlBtn} onClick={() => setShowSQL(v => !v)}>
              {showSQL ? 'Hide setup SQL ▲' : 'Show database setup SQL ▼'}
            </button>
            {showSQL && (
              <pre className={styles.sqlBlock}>{SUPABASE_SETUP_SQL}</pre>
            )}
          </div>
        </div>
      )}

      <AccountSection />

      {configured && (
        <p className={styles.desc}>
          Signing up or creating/joining a household above erroring out with a database error usually means
          this Supabase project is missing some setup.
        </p>
      )}
      {configured && (
        <p className={styles.desc}>
          <strong>Brand-new Supabase project, nothing set up yet:</strong>{' '}
          <button className={styles.sqlBtn} onClick={() => setShowAuthSQL(v => !v)} style={{ display: 'inline' }}>
            {showAuthSQL ? 'Hide Full Setup SQL ▲' : 'Show Full Setup SQL ▼'}
          </button>
        </p>
      )}
      {showAuthSQL && (
        <pre className={styles.sqlBlock}>{AUTH_SETUP_SQL_COMBINED}</pre>
      )}
      {configured && (
        <p className={styles.desc}>
          <strong>Already set up, just need the latest fix:</strong>{' '}
          <button className={styles.sqlBtn} onClick={() => setShowLatestFixSQL(v => !v)} style={{ display: 'inline' }}>
            {showLatestFixSQL ? 'Hide Latest Fix SQL ▲' : 'Show Latest Fix SQL ▼'}
          </button>
        </p>
      )}
      {showLatestFixSQL && (
        <pre className={styles.sqlBlock}>{LATEST_MIGRATION_FIX_SQL}</pre>
      )}

      <Toggle
        checked={!settings.cloudSyncPromptDismissed}
        onChange={checked => updateSettings({ cloudSyncPromptDismissed: !checked })}
        label="Show the sign-in reminder on launch when not signed in"
        id="cloud-sync-prompt-toggle"
      />

      {/* ── Household Sync ─────────────────────────────────────────── */}
      <h3 className={styles.subTitle}>Household Sync</h3>
      <p className={styles.desc}>
        Sync everything between your devices — ingredients, recipes, recipe collections, kitchen
        reference pages, meal plans, grocery lists, household items, and settings. Use the same code
        on every device in your home.
      </p>
      <p className={styles.desc}>
        Household Sync shares everything except personal API keys and device theme preferences.
        Macro logs and weight history are personal and stay on each device.
      </p>

      <Card padding="md">
        <div className={styles.codeRow}>
          <Input
            label="Household Sync Code"
            value={settings.householdSyncCode}
            onChange={e => updateSettings({ householdSyncCode: e.target.value })}
            placeholder="e.g. angelo-family-2026"
            hint="All devices using this code will sync together. Share only with people in your home."
          />
          <Button
            variant="secondary"
            size="sm"
            className={styles.genBtn}
            onClick={handleGenerateHouseholdCode}
          >
            Generate Code
          </Button>
        </div>

        <div className={styles.syncBtnGroup}>
          <Button
            onClick={() => handleSync('both')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            {syncing ? 'Syncing…' : '↕ Sync with Cloud'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSync('push')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            ↑ Push to Cloud
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSync('pull')}
            disabled={syncing || !configured || !settings.householdSyncCode}
          >
            ↓ Pull from Cloud
          </Button>
        </div>
        <p className={styles.lastSynced}>
          Last synced on this device: {formatRelativeTime(settings.lastHouseholdSyncAt)}
        </p>

        <OperationStatus
          state={syncState}
          progress={syncProgress}
          doneMessage={summary ? buildSyncDoneMessage(summary) : undefined}
          errorMessage={summary ? buildSyncErrorMessage(summary) : undefined}
          onDismiss={() => setSyncState('idle')}
          reassuranceMessage="Large syncs can take several minutes — you can close this tab and check back, or wait here."
        />
        {summary && (
          <SyncResultDisplay
            summary={summary}
            onReviewDuplicate={setDupToResolve}
            onBulkResolve={bulkResolveHousehold}
            onReviewCollision={setCollisionToResolve}
            onBulkResolveCollisions={bulkResolveHouseholdCollisions}
            showSummary={false}
          />
        )}
      </Card>

      {/* ── Family Share ───────────────────────────────────────────── */}
      <h3 className={styles.subTitle} style={{ marginTop: 'var(--space-5)' }}>Family Share</h3>
      <p className={styles.desc}>
        Share recipes and nutritional info with family in another home — without sharing prices or store names.
        They enter their own local prices. This now requires signing in (Account, above) — a real household record
        backs each Family Share, the same way your own household does.
      </p>

      <FamilyShareSection url={settings.supabaseUrl} anonKey={settings.supabaseAnonKey} />

      <Card padding="md">
        <div className={styles.syncBtnGroup} style={{ marginTop: 'var(--space-3)' }}>
          <Button
            onClick={() => handleFamilySync('both')}
            disabled={familySyncing || !configured || !settings.familyShareCode || settings.familyShareRole === 'readonly'}
          >
            {familySyncing ? 'Syncing…' : '↕ Sync Family Share'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleFamilySync('pull')}
            disabled={familySyncing || !configured || !settings.familyShareCode}
          >
            ↓ Pull from Family
          </Button>
        </div>

        {settings.familyShareRole === 'readonly' && (
          <p className={styles.roleNote}>Read-only mode: you can pull from family but not push changes.</p>
        )}
        <p className={styles.lastSynced}>
          Last synced on this device: {formatRelativeTime(settings.lastFamilySyncAt)}
        </p>

        <OperationStatus
          state={familySyncState}
          progress={familySyncProgress}
          doneMessage={familySummary ? buildSyncDoneMessage(familySummary) : undefined}
          errorMessage={familySummary ? buildSyncErrorMessage(familySummary) : undefined}
          onDismiss={() => setFamilySyncState('idle')}
          reassuranceMessage="Large syncs can take several minutes — you can close this tab and check back, or wait here."
        />
        {familySummary && (
          <SyncResultDisplay
            summary={familySummary}
            onReviewDuplicate={setDupToResolve}
            onBulkResolve={bulkResolveFamily}
            onReviewCollision={setCollisionToResolve}
            onBulkResolveCollisions={bulkResolveFamilyCollisions}
            showSummary={false}
          />
        )}
      </Card>

      {/* ── Duplicate review modal ─────────────────────────────────── */}
      {dupToResolve && (
        <Modal
          open
          onClose={() => { if (!resolving) { setDupToResolve(null); setResolveError('') } }}
          title="Duplicate Found"
          size="sm"
          footer={
            <>
              <Button variant="secondary" disabled={resolving} onClick={() => { setDupToResolve(null); setResolveError('') }}>Skip</Button>
              <Button variant="secondary" disabled={resolving} onClick={() => handleResolveDuplicate('keep-local')}>{resolving ? 'Resolving…' : 'Keep Mine'}</Button>
              <Button variant="secondary" disabled={resolving} onClick={() => handleResolveDuplicate('keep-both')}>{resolving ? 'Resolving…' : 'Keep Both'}</Button>
              <Button disabled={resolving} onClick={() => handleResolveDuplicate('keep-cloud')}>{resolving ? 'Resolving…' : 'Keep Theirs'}</Button>
            </>
          }
        >
          <p>
            A {dupToResolve.type} named <strong>"{(dupToResolve.localItem as Ingredient | Recipe).name}"</strong> already
            exists locally but the cloud has a different version with the same name.
          </p>
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <strong>Keep Mine</strong> — discard the cloud version.<br />
            <strong>Keep Both</strong> — save both (cloud version added with its own ID).<br />
            <strong>Keep Theirs</strong> — replace your local version with the cloud version.
          </p>
          {resolveError && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
              ⚠ {resolveError}
            </p>
          )}
        </Modal>
      )}

      {/* ── Collision review modal ─────────────────────────────────── */}
      {collisionToResolve && (
        <Modal
          open
          onClose={() => { if (!collisionResolving) { setCollisionToResolve(null); setCollisionResolveError('') } }}
          title="Couldn't Sync This Item"
          size="sm"
          footer={
            <>
              <Button variant="secondary" disabled={collisionResolving} onClick={() => handleResolveCollision('skip')}>Skip for Now</Button>
              <Button disabled={collisionResolving} onClick={() => handleResolveCollision('push-as-new')}>
                {collisionResolving ? 'Pushing…' : 'Push as New'}
              </Button>
            </>
          }
        >
          <p>
            <strong>"{(collisionToResolve.localItem as Ingredient | Recipe).name}"</strong> couldn't be synced — it may
            already exist elsewhere and isn't visible from here to compare against.
          </p>
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            <strong>Skip for Now</strong> — leave it out of this sync; if it's still unresolved next time, it'll show up here again.<br />
            <strong>Push as New</strong> — add it as a separate new item in this household.
          </p>
          {collisionResolveError && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>
              ⚠ {collisionResolveError}
            </p>
          )}
        </Modal>
      )}

      {/* SQL setup modal */}
      <Modal
        open={showSQL && configured}
        onClose={() => setShowSQL(false)}
        title="Supabase Database Setup SQL"
        size="lg"
        footer={<Button variant="secondary" onClick={() => setShowSQL(false)}>Close</Button>}
      >
        <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
          Run this SQL in your Supabase project under <strong>Database → SQL Editor → New Query</strong>.
          Only needs to be done once.
        </p>
        <pre className={styles.sqlBlock}>{SUPABASE_SETUP_SQL}</pre>
      </Modal>
    </div>
  )
}

const BULK_ACTION_LABELS: Record<'keep-local' | 'keep-cloud' | 'keep-newer', string> = {
  'keep-local': 'Mine',
  'keep-cloud': 'Cloud',
  'keep-newer': 'Newer',
}

function SyncResultDisplay({
  summary,
  onReviewDuplicate,
  onBulkResolve,
  onReviewCollision,
  onBulkResolveCollisions,
  showSummary = true,
}: {
  summary: SyncSummary
  onReviewDuplicate: (d: SyncDuplicate) => void
  onBulkResolve: (dups: SyncDuplicate[], action: 'keep-local' | 'keep-cloud' | 'keep-newer') => Promise<{ keptLocal: number; keptCloud: number }>
  onReviewCollision: (c: SyncCollision) => void
  onBulkResolveCollisions: (collisions: SyncCollision[], action: 'skip' | 'push-as-new') => Promise<{ skipped: number; pushed: number }>
  // False for both Household Sync and Family Share, whose success/error text
  // is now owned by their respective OperationStatus components (see both
  // render blocks above) — showing it twice would duplicate the same
  // information in two different visual styles. The default (true) remains
  // only for any caller that doesn't pass the prop explicitly.
  showSummary?: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [resolving, setResolving] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ action: 'keep-local' | 'keep-cloud' | 'keep-newer'; count: number; keptLocal: number; keptCloud: number } | null>(null)

  // Independent from `selected` above — not shared. toggleSelectAllCollisions()
  // and toggleSelectAll() each unconditionally *replace* their own Set (not
  // merge), so sharing one Set between the two sections would let selecting
  // "all" in one silently wipe out an in-progress selection in the other.
  const [selectedCollisions, setSelectedCollisions] = useState<Set<string>>(new Set())
  const [collisionBulkResolving, setCollisionBulkResolving] = useState(false)
  const [collisionBulkResult, setCollisionBulkResult] = useState<{ action: 'skip' | 'push-as-new'; count: number; skipped: number; pushed: number } | null>(null)

  const hasActivity = summary.addedLocally + summary.uploadedToCloud + summary.updatedToNewer > 0
  const hasErrors   = summary.errors.length > 0
  const dups        = summary.duplicatesForReview
  const hasDups     = dups.length > 0
  const allSelected = hasDups && selected.size === dups.length

  const collisions            = summary.collisionsForReview
  const hasCollisions          = collisions.length > 0
  const allCollisionsSelected  = hasCollisions && selectedCollisions.size === collisions.length

  if (!showSummary && !hasDups && !bulkResult && !hasCollisions && !collisionBulkResult) return null

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(dups.map(d => d.localItem.id)))
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllCollisions() {
    setSelectedCollisions(allCollisionsSelected ? new Set() : new Set(collisions.map(c => c.localItem.id)))
  }

  function toggleOneCollision(id: string) {
    setSelectedCollisions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkAction(action: 'keep-local' | 'keep-cloud' | 'keep-newer') {
    const targets = selected.size > 0 ? dups.filter(d => selected.has(d.localItem.id)) : dups
    if (targets.length === 0 || resolving) return
    setResolving(true)
    try {
      const { keptLocal, keptCloud } = await onBulkResolve(targets, action)
      setSelected(new Set())
      setBulkResult({ action, count: targets.length, keptLocal, keptCloud })
    } finally {
      setResolving(false)
    }
  }

  async function handleBulkCollisionAction(action: 'skip' | 'push-as-new') {
    const targets = selectedCollisions.size > 0
      ? collisions.filter(c => selectedCollisions.has(c.localItem.id))
      : collisions
    if (targets.length === 0 || collisionBulkResolving) return
    setCollisionBulkResolving(true)
    try {
      const { skipped, pushed } = await onBulkResolveCollisions(targets, action)
      setSelectedCollisions(new Set())
      setCollisionBulkResult({ action, count: targets.length, skipped, pushed })
    } finally {
      setCollisionBulkResolving(false)
    }
  }

  return (
    <div className={`${styles.syncResult} ${!hasErrors ? styles.syncResultOk : ''}`}>
      {showSummary && hasErrors && summary.errors.map((err, i) => (
        <p key={i} className={styles.syncError}>{err}</p>
      ))}
      {showSummary && !hasErrors && (
        <p className={styles.syncSuccess}>
          ✓ Sync complete —{' '}
          {summary.addedLocally} new {summary.addedLocally === 1 ? 'item' : 'items'} added from cloud,{' '}
          {summary.uploadedToCloud} {summary.uploadedToCloud === 1 ? 'item' : 'items'} uploaded,{' '}
          {summary.updatedToNewer} updated to newer version.
          {!hasActivity && !hasDups && !bulkResult && !hasCollisions && !collisionBulkResult && ' Everything is already up to date.'}
        </p>
      )}
      {bulkResult && (
        <p className={styles.syncSuccess}>
          ✓ {bulkResult.count} duplicate{bulkResult.count !== 1 ? 's' : ''} resolved using{' '}
          <strong>Keep {bulkResult.action === 'keep-newer' ? 'All Newer' : `All ${BULK_ACTION_LABELS[bulkResult.action]}`}</strong>
          {bulkResult.action === 'keep-newer'
            ? ` — ${bulkResult.keptLocal} kept local, ${bulkResult.keptCloud} kept cloud.`
            : bulkResult.action === 'keep-local' ? ' — kept your local version for all.' : ' — kept the cloud version for all.'}
        </p>
      )}
      {collisionBulkResult && (
        <p className={styles.syncSuccess}>
          ✓ {collisionBulkResult.count} item{collisionBulkResult.count !== 1 ? 's' : ''} handled —{' '}
          {collisionBulkResult.action === 'push-as-new'
            ? `${collisionBulkResult.pushed} pushed as new items.`
            : `${collisionBulkResult.skipped} skipped for this sync.`}
        </p>
      )}
      {hasDups && (
        <div className={styles.dupList}>
          <p className={styles.dupSummaryLine}>
            {dups.length} duplicate{dups.length !== 1 ? 's' : ''} found — most are likely from one of the starter
            ingredient libraries (USDA basics or Great Value branded products) being loaded independently on
            multiple devices. Use Keep All Newer to resolve automatically.
          </p>

          <div className={styles.dupBulkBtnGroup}>
            <Button variant="secondary" size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-local')}>
              {selected.size > 0 ? `Keep Mine (${selected.size})` : 'Keep All Mine'}
            </Button>
            <Button variant="secondary" size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-cloud')}>
              {selected.size > 0 ? `Keep Cloud (${selected.size})` : 'Keep All Cloud'}
            </Button>
            <Button size="sm" disabled={resolving} onClick={() => handleBulkAction('keep-newer')}>
              {selected.size > 0 ? `Keep Newer (${selected.size})` : 'Keep All Newer'}
            </Button>
          </div>

          <label className={styles.dupSelectAllRow}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all duplicates"
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>

          {dups.map(dup => (
            <div key={dup.localItem.id} className={styles.dupItem}>
              <input
                type="checkbox"
                checked={selected.has(dup.localItem.id)}
                onChange={() => toggleOne(dup.localItem.id)}
                aria-label={`Select ${(dup.localItem as Ingredient | Recipe).name}`}
              />
              {dup.type === 'ingredient' ? '🥕' : '📖'}{' '}
              <strong>{(dup.localItem as Ingredient | Recipe).name}</strong>
              <button className={styles.dupReviewLink} onClick={() => onReviewDuplicate(dup)}>Review →</button>
            </div>
          ))}
        </div>
      )}
      {hasCollisions && (
        <div className={styles.dupList}>
          <p className={styles.dupSummaryLine}>
            {collisions.length} item{collisions.length !== 1 ? 's' : ''} couldn't be synced — each may already
            exist elsewhere and isn't visible from here to compare against. Skipping just leaves it out of this
            sync; if it's still unresolved next time, it'll show up here again.
          </p>

          <div className={styles.dupBulkBtnGroup}>
            <Button variant="secondary" size="sm" disabled={collisionBulkResolving} onClick={() => handleBulkCollisionAction('skip')}>
              {selectedCollisions.size > 0 ? `Skip for Now (${selectedCollisions.size})` : 'Skip All for Now'}
            </Button>
            <Button size="sm" disabled={collisionBulkResolving} onClick={() => handleBulkCollisionAction('push-as-new')}>
              {selectedCollisions.size > 0 ? `Push as New (${selectedCollisions.size})` : 'Push All as New'}
            </Button>
          </div>

          <label className={styles.dupSelectAllRow}>
            <input
              type="checkbox"
              checked={allCollisionsSelected}
              onChange={toggleSelectAllCollisions}
              aria-label="Select all items that couldn't be synced"
            />
            {selectedCollisions.size > 0 ? `${selectedCollisions.size} selected` : 'Select all'}
          </label>

          {collisions.map(c => (
            <div key={c.localItem.id} className={styles.dupItem}>
              <input
                type="checkbox"
                checked={selectedCollisions.has(c.localItem.id)}
                onChange={() => toggleOneCollision(c.localItem.id)}
                aria-label={`Select ${(c.localItem as Ingredient | Recipe).name}`}
              />
              {c.type === 'ingredient' ? '🥕' : '📖'}{' '}
              <strong>{(c.localItem as Ingredient | Recipe).name}</strong>
              <button className={styles.dupReviewLink} onClick={() => onReviewCollision(c)}>Review →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
