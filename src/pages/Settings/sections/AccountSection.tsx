import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Input, Select } from '@/components/ui'
import { useSync } from '@/sync/syncContext'
import type { ManagedUser, Role } from '@/sync/api'
import styles from './AccountSection.module.css'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'readonly', label: 'Read only' },
]

const ROLE_HELP: Record<Role, string> = {
  owner: 'Can do everything, including adding people and changing what they can do.',
  contributor: 'Can add and change recipes, ingredients, meal plans, and lists.',
  readonly: 'Can look at everything, but cannot change anything.',
}
const roleLabel = (r: Role) => ROLE_OPTIONS.find(o => o.value === r)!.label

const PASSWORD_HINT = 'At least 10 characters. A few words strung together works well.'
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback)

export function AccountSection() {
  const { state, user, needsSetup } = useSync()

  return (
    <div className={styles.wrap}>
      <h3 className={styles.subTitle}>Account</h3>
      <Card padding="md">
        {state === 'unavailable' ? (
          <p className={styles.desc}>
            Sharing isn't available here. This copy of the app isn't connected to your household's server, so everything
            you do stays on this device. (Open the app from your household's own address to sign in.)
          </p>
        ) : state === 'checking' ? (
          <p className={styles.desc}>Checking sign-in status…</p>
        ) : !user ? (
          needsSetup ? <SetupForm /> : <SignInForm />
        ) : (
          <SignedInView />
        )}
      </Card>
    </div>
  )
}

// ─── First run: the very first account becomes the owner ────────────────────

function SetupForm() {
  const { createFirstAccount } = useSync()
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError("The two passwords don't match."); return }
    setSubmitting(true)
    try {
      await createFirstAccount(username.trim(), displayName.trim(), password)
    } catch (err) {
      setError(message(err, 'Could not create the account.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.authForm}>
      <p className={styles.desc}>
        <strong>Set up your household.</strong> Nobody has an account yet. The account you create now is the <strong>owner</strong>:
        it can add everyone else. This only appears once.
      </p>
      <Input label="Your name" required value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" />
      <Input label="Username" required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username"
        hint="Letters and numbers, 2 or more. You'll type this to sign in." />
      <Input label="Password" type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)}
        autoComplete="new-password" hint={PASSWORD_HINT} />
      <Input label="Password again" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? 'Creating…' : 'Create owner account'}</Button>
    </form>
  )
}

// ─── Signing in ──────────────────────────────────────────────────────────────

function SignInForm() {
  const { signIn } = useSync()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await signIn(username.trim(), password)
    } catch (err) {
      setError(message(err, 'Sign in failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.authForm}>
      <p className={styles.desc}>
        Sign in with the username and password your household's owner gave you. (There's no sign-up here — an owner adds each person.)
      </p>
      <Input label="Username" required value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
      <Input label="Password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign In'}</Button>
    </form>
  )
}

// ─── Signed in ───────────────────────────────────────────────────────────────

function SignedInView() {
  const { user, signOut } = useSync()
  const [signingOut, setSigningOut] = useState(false)
  const [changing, setChanging] = useState(false)
  if (!user) return null

  return (
    <div className={styles.signedIn}>
      <div className={styles.signedInHeader}>
        <span>Signed in as <strong>{user.displayName}</strong> <span className={styles.codeTag}>{user.username}</span> <span className={styles.roleTag}>{roleLabel(user.role)}</span></span>
        <Button variant="secondary" size="sm" disabled={signingOut} onClick={async () => { setSigningOut(true); try { await signOut() } finally { setSigningOut(false) } }}>
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </Button>
      </div>
      <p className={styles.desc}>{ROLE_HELP[user.role]}</p>

      {changing
        ? <ChangePasswordForm onDone={() => setChanging(false)} />
        : <div><button type="button" className={styles.linkBtn} onClick={() => setChanging(true)}>Change my password</button></div>}

      {user.role === 'owner' && <PeoplePanel myId={user.id} />}
    </div>
  )
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { server } = useSync()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError("The two new passwords don't match."); return }
    setSubmitting(true)
    try {
      await server.changeOwnPassword(current, next)
      setDone(true)
    } catch (err) {
      setError(message(err, 'Could not change the password.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className={styles.inlineForm}>
        <p className={styles.success}>Password changed. You've been signed out on your other devices — sign in there with the new password. This device stays signed in.</p>
        <div className={styles.formActions}><Button size="sm" variant="secondary" onClick={onDone}>Close</Button></div>
      </div>
    )
  }
  return (
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <Input label="Current password" type="password" required value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
      <Input label="New password" type="password" required minLength={10} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" hint={PASSWORD_HINT} />
      <Input label="New password again" type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Saving…' : 'Change password'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

// ─── People (owners only) ────────────────────────────────────────────────────

function PeoplePanel({ myId }: { myId: string }) {
  const { server } = useSync()
  const [people, setPeople] = useState<ManagedUser[] | null>(null)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    try { setPeople(await server.listUsers()); setError('') } catch (e) { setError(message(e, "Couldn't load the list of people.")) }
  }, [server])
  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className={styles.people}>
      <h4 className={styles.peopleTitle}>People in this household</h4>
      <p className={styles.desc}>Each person signs in with their own username and password. You can change what someone can do, reset a forgotten password, or turn their access off.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!people ? <p className={styles.desc}>Loading…</p> : (
        <div className={styles.memberList}>
          {people.map(p => <PersonRow key={p.id} person={p} isMe={p.id === myId} onChanged={refresh} onError={setError} />)}
        </div>
      )}
      {adding
        ? <AddPersonForm onDone={() => { setAdding(false); void refresh() }} />
        : <div className={styles.createJoinRow}><Button variant="secondary" size="sm" onClick={() => setAdding(true)}>+ Add a person</Button></div>}
    </div>
  )
}

function PersonRow({ person, isMe, onChanged, onError }: { person: ManagedUser; isMe: boolean; onChanged: () => Promise<void>; onError: (m: string) => void }) {
  const { server } = useSync()
  const [mode, setMode] = useState<'idle' | 'reset' | 'remove'>('idle')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    onError('')
    try { await fn(); setMode('idle'); setPw(''); await onChanged() } catch (e) { onError(message(e, 'That did not work.')) } finally { setBusy(false) }
  }

  return (
    <div className={styles.personCard}>
      <div className={styles.memberRow}>
        <span className={styles.memberName}>
          {person.displayName} <span className={styles.codeTag}>{person.username}</span>
          {isMe && ' (you)'}
          {person.disabled && <span className={styles.badge}>Turned off</span>}
        </span>
        <Select
          options={ROLE_OPTIONS}
          value={person.role}
          disabled={busy}
          aria-label={`What ${person.displayName} can do`}
          onChange={e => act(() => server.setUserRole(person.id, e.target.value as Role))}
          wrapperClassName={styles.roleSelect}
        />
      </div>
      <p className={styles.roleHelp}>{ROLE_HELP[person.role]}</p>

      {mode === 'idle' && (
        <div className={styles.personActions}>
          <button type="button" className={styles.linkBtn} disabled={busy} onClick={() => setMode('reset')}>Reset password</button>
          {!isMe && (
            <button type="button" className={styles.linkBtn} disabled={busy}
              onClick={() => act(() => server.setUserDisabled(person.id, !person.disabled))}>
              {person.disabled ? 'Turn access back on' : 'Turn access off'}
            </button>
          )}
          {!isMe && <button type="button" className={styles.linkBtnDanger} disabled={busy} onClick={() => setMode('remove')}>Remove</button>}
        </div>
      )}

      {mode === 'reset' && (
        <form className={styles.inlineForm} onSubmit={e => { e.preventDefault(); void act(() => server.resetUserPassword(person.id, pw)) }}>
          <Input label={`New password for ${person.displayName}`} type="password" required minLength={10} value={pw} onChange={e => setPw(e.target.value)}
            autoComplete="new-password" hint={`${PASSWORD_HINT} They'll be signed out everywhere and can sign in with this.`} />
          <div className={styles.formActions}>
            <Button type="submit" size="sm" disabled={busy}>{busy ? 'Saving…' : 'Set password'}</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setMode('idle'); setPw('') }}>Cancel</Button>
          </div>
        </form>
      )}

      {mode === 'remove' && (
        <div className={styles.confirmRow}>
          <span>Remove {person.displayName}'s account? Everything they added to the household stays.</span>
          <span className={styles.formActions}>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode('idle')}>Keep</Button>
            <Button size="sm" disabled={busy} onClick={() => act(() => server.removeUser(person.id))}>{busy ? 'Removing…' : 'Yes, remove'}</Button>
          </span>
        </div>
      )}
    </div>
  )
}

function AddPersonForm({ onDone }: { onDone: () => void }) {
  const { server } = useSync()
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('contributor')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await server.createUser({ username: username.trim(), displayName: displayName.trim(), password, role })
      onDone()
    } catch (err) {
      setError(message(err, 'Could not add that person.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.inlineForm}>
      <Input label="Their name" required value={displayName} onChange={e => setDisplayName(e.target.value)} />
      <Input label="Username" required value={username} onChange={e => setUsername(e.target.value)} autoCapitalize="none"
        hint="Letters and numbers. They'll type this to sign in." />
      <Input label="Starting password" type="password" required minLength={10} value={password} onChange={e => setPassword(e.target.value)}
        autoComplete="new-password" hint={`${PASSWORD_HINT} Tell them it, and suggest they change it after they sign in.`} />
      <Select label="What can they do?" options={ROLE_OPTIONS} value={role} onChange={e => setRole(e.target.value as Role)} />
      <p className={styles.roleHelp}>{ROLE_HELP[role]}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.formActions}>
        <Button type="submit" size="sm" disabled={submitting}>{submitting ? 'Adding…' : 'Add person'}</Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}
