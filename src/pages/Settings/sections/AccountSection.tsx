import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Input, Select } from '@/components/ui'
import { useSettings } from '@/context/SettingsContext'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'
import {
  signUpWithPassword, signInWithPassword, signOut,
  createHousehold, joinHouseholdByCode, getMyHouseholds, getHouseholdMembers,
  updateMemberRole, removeMember,
  type HouseholdMembership, type HouseholdMemberRow, type MemberRole,
} from '@/db/auth'
import { generateSyncCode, isSupabaseConfigured } from '@/db/supabase'
import styles from './AccountSection.module.css'

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'readonly', label: 'Read Only' },
]

export function AccountSection() {
  const { settings, updateSettings } = useSettings()
  const configured = isSupabaseConfigured(settings)
  const { session, user, loading } = useSupabaseAuth(settings.supabaseUrl, settings.supabaseAnonKey)

  if (!configured) return null

  return (
    <div className={styles.wrap}>
      <h3 className={styles.subTitle}>Account</h3>
      <p className={styles.desc}>
        Real per-person login for Cloud Sync — separate from the household code below, which is now
        just how a household is found, not how access is granted. Nothing here changes until you (or
        anyone else) actually creates a household or joins one.
      </p>
      <Card padding="md">
        {loading ? (
          <p className={styles.desc}>Checking sign-in status…</p>
        ) : session && user ? (
          <SignedInView email={user.email ?? ''} url={settings.supabaseUrl} anonKey={settings.supabaseAnonKey} onHouseholdLinked={code => updateSettings({ householdSyncCode: code })} />
        ) : (
          <AuthForm url={settings.supabaseUrl} anonKey={settings.supabaseAnonKey} />
        )}
      </Card>
    </div>
  )
}

function AuthForm({ url, anonKey }: { url: string; anonKey: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setConfirmationSent(false)
    try {
      if (mode === 'signup') {
        const result = await signUpWithPassword(url, anonKey, email, password)
        if (!result.ok) { setError(result.error ?? 'Sign up failed.'); return }
        if (result.needsEmailConfirmation) { setConfirmationSent(true); return }
      } else {
        const result = await signInWithPassword(url, anonKey, email, password)
        if (!result.ok) { setError(result.error ?? 'Sign in failed.'); return }
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.authForm}>
      <div className={styles.modeToggle}>
        <button type="button" className={mode === 'signin' ? styles.modeActive : styles.modeBtn} onClick={() => setMode('signin')}>Sign In</button>
        <button type="button" className={mode === 'signup' ? styles.modeActive : styles.modeBtn} onClick={() => setMode('signup')}>Sign Up</button>
      </div>
      <Input
        label="Email"
        type="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Input
        label="Password"
        type="password"
        required
        minLength={6}
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        hint={mode === 'signup' ? 'At least 6 characters.' : undefined}
      />
      {error && <p className={styles.error}>{error}</p>}
      {confirmationSent && (
        <p className={styles.success}>
          Account created — check your email for a confirmation link before signing in.
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Working…' : mode === 'signup' ? 'Create Account' : 'Sign In'}
      </Button>
    </form>
  )
}

function SignedInView({
  email, url, anonKey, onHouseholdLinked,
}: {
  email: string
  url: string
  anonKey: string
  onHouseholdLinked: (code: string) => void
}) {
  const [households, setHouseholds] = useState<HouseholdMembership[]>([])
  const [loadingHouseholds, setLoadingHouseholds] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  const refresh = useCallback(async () => {
    setLoadingHouseholds(true)
    const list = await getMyHouseholds(url, anonKey)
    setHouseholds(list)
    setLoadingHouseholds(false)
  }, [url, anonKey])

  useEffect(() => { refresh() }, [refresh])

  async function handleSignOut() {
    setSigningOut(true)
    await signOut(url, anonKey)
    setSigningOut(false)
  }

  return (
    <div className={styles.signedIn}>
      <div className={styles.signedInHeader}>
        <span>Signed in as <strong>{email}</strong></span>
        <Button variant="secondary" size="sm" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </Button>
      </div>

      {loadingHouseholds ? (
        <p className={styles.desc}>Loading your households…</p>
      ) : (
        <>
          {households.map(h => (
            <HouseholdCard key={h.householdId} household={h} url={url} anonKey={anonKey} myEmail={email} onChanged={refresh} />
          ))}
          <CreateOrJoinForm
            url={url}
            anonKey={anonKey}
            email={email}
            onLinked={code => { onHouseholdLinked(code); refresh() }}
          />
        </>
      )}
    </div>
  )
}

function HouseholdCard({
  household, url, anonKey, myEmail, onChanged,
}: {
  household: HouseholdMembership
  url: string
  anonKey: string
  myEmail: string
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [members, setMembers] = useState<HouseholdMemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  async function toggleExpand() {
    const next = !expanded
    setExpanded(next)
    if (next && members.length === 0) {
      setLoadingMembers(true)
      setMembers(await getHouseholdMembers(url, anonKey, household.householdId))
      setLoadingMembers(false)
    }
  }

  async function handleRoleChange(userId: string, role: MemberRole) {
    await updateMemberRole(url, anonKey, household.householdId, userId, role)
    setMembers(await getHouseholdMembers(url, anonKey, household.householdId))
    onChanged()
  }

  async function handleRemove(userId: string) {
    await removeMember(url, anonKey, household.householdId, userId)
    setMembers(await getHouseholdMembers(url, anonKey, household.householdId))
    onChanged()
  }

  return (
    <div className={styles.householdCard}>
      <div className={styles.householdHeader}>
        <div>
          <strong>{household.name || household.code}</strong>
          <span className={styles.codeTag}>{household.code}</span>
        </div>
        <div className={styles.householdMeta}>
          <span className={styles.roleTag}>{household.role}</span>
          <button type="button" className={styles.linkBtn} onClick={toggleExpand}>
            {expanded ? 'Hide members' : 'Manage members'}
          </button>
        </div>
      </div>
      {expanded && (
        loadingMembers ? (
          <p className={styles.desc}>Loading members…</p>
        ) : (
          <div className={styles.memberList}>
            {members.map(m => (
              <div key={m.userId} className={styles.memberRow}>
                <span className={styles.memberName}>{m.displayName || m.userId}{m.displayName === myEmail ? ' (you)' : ''}</span>
                {household.role === 'owner' ? (
                  <>
                    <Select
                      options={ROLE_OPTIONS}
                      value={m.role}
                      onChange={e => handleRoleChange(m.userId, e.target.value as MemberRole)}
                      wrapperClassName={styles.roleSelect}
                    />
                    <button type="button" className={styles.linkBtnDanger} onClick={() => handleRemove(m.userId)}>Remove</button>
                  </>
                ) : (
                  <span className={styles.roleTag}>{m.role}</span>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function CreateOrJoinForm({
  url, anonKey, email, onLinked,
}: {
  url: string
  anonKey: string
  email: string
  onLinked: (code: string) => void
}) {
  const [mode, setMode] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const newCode = code.trim() || generateSyncCode(name)
    const result = await createHousehold(url, anonKey, newCode, name.trim(), email)
    setSubmitting(false)
    if (!result.ok) { setError(result.error ?? 'Could not create household.'); return }
    onLinked(newCode)
    setMode(null)
    setName('')
    setCode('')
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const result = await joinHouseholdByCode(url, anonKey, code.trim(), email)
    setSubmitting(false)
    if (!result.ok) { setError(result.error ?? 'Could not join that household.'); return }
    onLinked(code.trim())
    setMode(null)
    setCode('')
  }

  if (mode === null) {
    return (
      <div className={styles.createJoinRow}>
        <Button variant="secondary" size="sm" onClick={() => setMode('create')}>+ Create a Household</Button>
        <Button variant="secondary" size="sm" onClick={() => setMode('join')}>Join by Code</Button>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <form onSubmit={handleCreate} className={styles.inlineForm}>
        <Input label="Household name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Angelo Family" required />
        <Input label="Code (optional — auto-generated if blank)" value={code} onChange={e => setCode(e.target.value)} placeholder="leave blank to generate one" />
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.formActions}>
          <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleJoin} className={styles.inlineForm}>
      <Input label="Household code" value={code} onChange={e => setCode(e.target.value)} placeholder="the code someone shared with you" required />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Joining…' : 'Join'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setMode(null)}>Cancel</Button>
      </div>
    </form>
  )
}
