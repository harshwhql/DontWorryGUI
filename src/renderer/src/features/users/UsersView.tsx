import { useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Lock,
  LockOpen,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X
} from 'lucide-react'
import type { GroupEntry, UserEntry } from '@shared/types'
import { cn } from '../../lib/format'
import { useDebounced, useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  Select,
  Textarea,
  Toggle
} from '../../components/ui/primitives'
import { DataTable, KeyValue, type Column } from '../../components/ui/data'
import { Modal } from '../../components/ui/overlay'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

interface UsersPayload {
  users: UserEntry[]
  groups: GroupEntry[]
  shells: string[]
}

interface AuthorizedKey {
  type: string
  comment: string
  raw: string
}

const ADMIN_GROUPS = new Set(['sudo', 'wheel', 'admin', 'root'])

export function UsersView(): React.JSX.Element {
  const run = useApp((s) => s.run)

  const [tab, setTab] = useState<'people' | 'groups'>('people')
  const [search, setSearch] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [selected, setSelected] = useState<UserEntry | null>(null)
  const [keys, setKeys] = useState<AuthorizedKey[] | null>(null)
  const [dialog, setDialog] = useState<null | 'create' | 'password' | 'addKey' | 'group'>(null)
  const debounced = useDebounced(search, 200)

  // create-user form
  const [newUser, setNewUser] = useState({
    name: '',
    shell: '/bin/bash',
    comment: '',
    sudo: false,
    createHome: true
  })
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [keyText, setKeyText] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupToAdd, setGroupToAdd] = useState('')

  const data = useResource<UsersPayload>('users.list', {})

  const rows = useMemo(() => {
    const all = data.data?.users ?? []
    const term = debounced.trim().toLowerCase()
    return all.filter((user) => {
      if (!showSystem && user.isSystem) return false
      if (!term) return true
      return (
        user.name.toLowerCase().includes(term) ||
        user.comment.toLowerCase().includes(term) ||
        user.groups.some((group) => group.toLowerCase().includes(term))
      )
    })
  }, [data.data, debounced, showSystem])

  const loadKeys = async (user: UserEntry): Promise<void> => {
    setKeys(null)
    const result = await run<AuthorizedKey[]>('users.keys.list', { name: user.name }, { quiet: true })
    setKeys(result ?? [])
  }

  useEffect(() => {
    if (selected) void loadKeys(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.name])

  const afterChange = (): void => {
    setDialog(null)
    void data.refresh(true)
    if (selected) void loadKeys(selected)
  }

  const userColumns: Column<UserEntry>[] = [
    {
      key: 'name',
      header: 'User',
      width: 'minmax(120px,1fr)',
      sort: (row) => row.name,
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span className={cn('mono', row.uid === 0 ? 'text-root' : 'text-ink')}>{row.name}</span>
          {row.locked ? <Lock size={10} className="text-warn" aria-label="locked" /> : null}
        </span>
      )
    },
    {
      key: 'uid',
      header: 'UID',
      width: '64px',
      align: 'right',
      sort: (row) => row.uid,
      className: 'mono text-[10.5px]',
      render: (row) => row.uid
    },
    {
      key: 'groups',
      header: 'Groups',
      width: 'minmax(140px,1.4fr)',
      sort: (row) => row.groups.join(','),
      render: (row) => (
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {row.groups.slice(0, 4).map((group) => (
            <Badge key={group} tone={ADMIN_GROUPS.has(group) ? 'root' : 'neutral'} mono>
              {group}
            </Badge>
          ))}
          {row.groups.length > 4 ? (
            <span className="text-[10px] text-ink-ghost">+{row.groups.length - 4}</span>
          ) : null}
        </span>
      )
    },
    {
      key: 'shell',
      header: 'Shell',
      width: 'minmax(110px,150px)',
      sort: (row) => row.shell,
      className: 'mono text-[10.5px]',
      render: (row) => (
        <span className={/nologin|false$/.test(row.shell) ? 'text-ink-ghost' : undefined}>
          {row.shell}
        </span>
      )
    },
    {
      key: 'home',
      header: 'Home',
      width: 'minmax(110px,1fr)',
      sort: (row) => row.home,
      className: 'mono text-[10.5px]',
      render: (row) => row.home
    },
    {
      key: 'actions',
      header: '',
      width: '96px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek actionId={row.locked ? 'users.unlock' : 'users.lock'} params={{ name: row.name }} />
          <IconButton
            icon={row.locked ? LockOpen : Lock}
            label={row.locked ? `Unlock ${row.name}` : `Lock ${row.name} out`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              void run(
                row.locked ? 'users.unlock' : 'users.lock',
                { name: row.name },
                { successMessage: row.locked ? `${row.name} unlocked` : `${row.name} locked` }
              ).then(() => data.refresh(true))
            }}
          />
          <IconButton
            icon={KeyRound}
            label={`Set a password for ${row.name}`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              setSelected(row)
              setPassword('')
              setPassword2('')
              setDialog('password')
            }}
          />
        </span>
      )
    }
  ]

  const groupColumns: Column<GroupEntry>[] = [
    {
      key: 'name',
      header: 'Group',
      width: 'minmax(140px,1fr)',
      sort: (row) => row.name,
      render: (row) => (
        <span className={cn('mono', ADMIN_GROUPS.has(row.name) ? 'text-root' : 'text-ink')}>
          {row.name}
        </span>
      )
    },
    {
      key: 'gid',
      header: 'GID',
      width: '70px',
      align: 'right',
      sort: (row) => row.gid,
      className: 'mono text-[10.5px]',
      render: (row) => row.gid
    },
    {
      key: 'members',
      header: 'Members',
      width: 'minmax(0,2fr)',
      sort: (row) => row.members.length,
      render: (row) =>
        row.members.length ? (
          <span className="mono truncate text-[10.5px]">{row.members.join(', ')}</span>
        ) : (
          <span className="text-ink-ghost">no explicit members</span>
        )
    },
    {
      key: 'actions',
      header: '',
      width: '90px',
      align: 'right',
      render: (row) => (
        <ActionButton
          actionId="groups.delete"
          params={{ name: row.name }}
          icon={Trash2}
          variant="danger"
          size="xs"
          peek={false}
          options={{ successMessage: `${row.name} deleted` }}
          onDone={() => void data.refresh(true)}
        >
          Delete
        </ActionButton>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Users}
        title="Users & access"
        subtitle={`${data.data?.users.filter((u) => !u.isSystem).length ?? 0} people · ${data.data?.users.length ?? 0} accounts · ${data.data?.groups.length ?? 0} groups`}
        onRefresh={() => void data.refresh()}
        refreshing={data.loading}
        lastUpdated={data.lastUpdated}
      >
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'people', label: 'Accounts' },
            { value: 'groups', label: 'Groups' }
          ]}
        />
        <div className="relative w-48">
          <Search
            size={12}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter"
            className="pl-7"
            aria-label="Filter users"
          />
        </div>
        {tab === 'people' ? (
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-faint">
              <input
                type="checkbox"
                checked={showSystem}
                onChange={(event) => setShowSystem(event.target.checked)}
                className="size-3 accent-[var(--color-accent)]"
              />
              System accounts
            </label>
            <Button
              size="sm"
              variant="primary"
              icon={UserPlus}
              onClick={() => {
                setNewUser({ name: '', shell: '/bin/bash', comment: '', sudo: false, createHome: true })
                setDialog('create')
              }}
            >
              Add user
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="primary"
            icon={UserPlus}
            onClick={() => {
              setGroupName('')
              setDialog('group')
            }}
          >
            Add group
          </Button>
        )}
      </ViewHeader>

      {data.error ? <ErrorNote message={data.error} onRetry={() => void data.refresh()} /> : null}

      <div className="flex min-h-0 flex-1">
        {tab === 'people' ? (
          <DataTable
            rows={rows}
            columns={userColumns}
            rowKey={(row) => row.name}
            onRowClick={setSelected}
            isSelected={(row) => selected?.name === row.name}
            defaultSortKey="uid"
            defaultSortDir="asc"
            rowTone={(row) => (row.uid === 0 ? 'bg-root/5' : undefined)}
            emptyState={
              <EmptyState
                icon={Users}
                title={data.initial ? 'Reading /etc/passwd' : 'No accounts match'}
                message={
                  data.initial ? undefined : 'Tick “System accounts” to include service users.'
                }
              />
            }
            footer={
              <>
                <span>{rows.length} accounts shown</span>
                <span className="mono">getent passwd · getent group · passwd -S -a</span>
              </>
            }
          />
        ) : (
          <DataTable
            rows={data.data?.groups ?? []}
            columns={groupColumns}
            rowKey={(row) => row.name}
            defaultSortKey="gid"
            defaultSortDir="asc"
            emptyState={<EmptyState icon={Users} title="No groups returned" />}
            footer={<span className="mono">getent group</span>}
          />
        )}

        {tab === 'people' && selected ? (
          <aside className="anim-fade-up flex w-[400px] shrink-0 flex-col border-l border-line bg-surface/60">
            <header className="flex items-start gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="mono truncate text-[13px] font-semibold text-ink">{selected.name}</h2>
                  {selected.uid === 0 ? <Badge tone="root">superuser</Badge> : null}
                  {selected.groups.some((g) => ADMIN_GROUPS.has(g)) ? (
                    <Badge tone="root" icon={ShieldCheck}>
                      admin
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                  {selected.comment || 'No description set'}
                </p>
              </div>
              <IconButton icon={X} label="Close details" onClick={() => setSelected(null)} />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <KeyValue
                dense
                rows={[
                  { label: 'UID / GID', value: `${selected.uid} / ${selected.gid}`, mono: true },
                  { label: 'Home', value: selected.home, mono: true },
                  { label: 'Shell', value: selected.shell, mono: true },
                  {
                    label: 'Login',
                    value: selected.locked ? 'locked' : selected.locked === false ? 'enabled' : 'unknown'
                  },
                  { label: 'Groups', value: selected.groups.join(', ') || '—', mono: true }
                ]}
              />

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button
                  size="xs"
                  variant="secondary"
                  icon={KeyRound}
                  onClick={() => {
                    setPassword('')
                    setPassword2('')
                    setDialog('password')
                  }}
                >
                  Set password
                </Button>
                <ActionButton
                  actionId={selected.locked ? 'users.unlock' : 'users.lock'}
                  params={{ name: selected.name }}
                  icon={selected.locked ? LockOpen : Lock}
                  variant={selected.locked ? 'secondary' : 'warn'}
                  size="xs"
                  options={{ successMessage: selected.locked ? 'Account unlocked' : 'Account locked' }}
                  onDone={() => void data.refresh(true)}
                >
                  {selected.locked ? 'Unlock' : 'Lock out'}
                </ActionButton>
                <ActionButton
                  actionId="users.delete"
                  params={{ name: selected.name, removeHome: false }}
                  icon={Trash2}
                  variant="danger"
                  size="xs"
                  options={{
                    successMessage: 'Account deleted',
                    confirmBody:
                      'The account is removed but the home directory is left in place. Use the terminal with userdel -r if you want it gone too.'
                  }}
                  onDone={() => {
                    setSelected(null)
                    void data.refresh(true)
                  }}
                >
                  Delete account
                </ActionButton>
              </div>

              {/* shell + groups */}
              <Panel className="mt-3">
                <PanelHeader title="Shell & groups" />
                <div className="flex flex-col gap-3 p-2.5">
                  <div className="flex items-end gap-1.5">
                    <Field label="Login shell" className="flex-1">
                      <Select
                        value={selected.shell}
                        onChange={(event) =>
                          setSelected({ ...selected, shell: event.target.value })
                        }
                      >
                        {[...new Set([selected.shell, ...(data.data?.shells ?? []), '/usr/sbin/nologin'])]
                          .filter(Boolean)
                          .map((shell) => (
                            <option key={shell} value={shell}>
                              {shell}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <ActionButton
                      actionId="users.setShell"
                      params={{ name: selected.name, shell: selected.shell }}
                      size="sm"
                      options={{ successMessage: 'Shell changed' }}
                      onDone={() => void data.refresh(true)}
                    >
                      Apply
                    </ActionButton>
                  </div>

                  <div className="flex items-end gap-1.5">
                    <Field label="Add to a group" className="flex-1">
                      <Select value={groupToAdd} onChange={(event) => setGroupToAdd(event.target.value)}>
                        <option value="">Choose a group…</option>
                        {(data.data?.groups ?? [])
                          .filter((group) => !selected.groups.includes(group.name))
                          .map((group) => (
                            <option key={group.name} value={group.name}>
                              {group.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <ActionButton
                      actionId="users.addToGroup"
                      params={{ name: selected.name, group: groupToAdd }}
                      size="sm"
                      disabled={!groupToAdd}
                      options={{ successMessage: `Added to ${groupToAdd}` }}
                      onDone={() => {
                        setGroupToAdd('')
                        void data.refresh(true)
                      }}
                    >
                      Add
                    </ActionButton>
                  </div>

                  {selected.groups.length > 1 ? (
                    <div className="flex flex-wrap gap-1">
                      {selected.groups.map((group) => (
                        <ActionButton
                          key={group}
                          actionId="users.removeFromGroup"
                          params={{ name: selected.name, group }}
                          size="xs"
                          variant="outline"
                          peek={false}
                          options={{ successMessage: `Removed from ${group}` }}
                          onDone={() => void data.refresh(true)}
                        >
                          {group} ×
                        </ActionButton>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Panel>

              {/* ssh keys */}
              <Panel className="mt-3">
                <PanelHeader
                  title="Authorised SSH keys"
                  icon={KeyRound}
                  subtitle={`~${selected.name}/.ssh/authorized_keys`}
                  actions={
                    <Button
                      size="xs"
                      variant="primary"
                      onClick={() => {
                        setKeyText('')
                        setDialog('addKey')
                      }}
                    >
                      Add key
                    </Button>
                  }
                />
                {keys === null ? (
                  <p className="px-3 py-2 text-[11px] text-ink-ghost">Reading…</p>
                ) : keys.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-ink-ghost">
                    No keys authorised. This account signs in with a password only.
                  </p>
                ) : (
                  <ul className="divide-y divide-line/50">
                    {keys.map((key, index) => (
                      <li key={index} className="flex items-center gap-2 px-3 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="mono truncate text-[11px] text-ink-dim">
                            {key.comment || key.type}
                          </p>
                          <p className="mono truncate text-[9.5px] text-ink-ghost">{key.type}</p>
                        </div>
                        <ActionButton
                          actionId="users.keys.remove"
                          params={{ name: selected.name, key: key.raw }}
                          icon={Trash2}
                          variant="danger"
                          size="xs"
                          peek={false}
                          options={{ successMessage: 'Key revoked' }}
                          onDone={() => void loadKeys(selected)}
                        >
                          Revoke
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </aside>
        ) : null}
      </div>

      {/* ---------- dialogs ---------- */}

      <Modal
        open={dialog === 'create'}
        onClose={() => setDialog(null)}
        title="Add a user"
        subtitle="Creates the account with useradd, then optionally grants sudo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="users.create"
              params={{
                name: newUser.name,
                shell: newUser.shell,
                comment: newUser.comment,
                createHome: newUser.createHome,
                groups: newUser.sudo ? ['sudo'] : []
              }}
              variant="primary"
              size="sm"
              disabled={!/^[a-z_][a-z0-9_-]*$/.test(newUser.name)}
              options={{ successMessage: `${newUser.name} created` }}
              onDone={afterChange}
            >
              Create account
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label="Username"
            required
            hint="Lower case, starting with a letter or underscore."
            error={
              newUser.name && !/^[a-z_][a-z0-9_-]*$/.test(newUser.name)
                ? 'Use lower case letters, digits, dashes and underscores only.'
                : undefined
            }
          >
            <Input
              value={newUser.name}
              onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
              placeholder="deploy"
              mono
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Login shell">
              <Select
                value={newUser.shell}
                onChange={(event) => setNewUser({ ...newUser, shell: event.target.value })}
              >
                {['/bin/bash', '/bin/sh', '/bin/zsh', '/usr/sbin/nologin'].map((shell) => (
                  <option key={shell} value={shell}>
                    {shell}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Full name or note">
              <Input
                value={newUser.comment}
                onChange={(event) => setNewUser({ ...newUser, comment: event.target.value })}
                placeholder="Deployment robot"
              />
            </Field>
          </div>
          <Toggle
            checked={newUser.createHome}
            onChange={(value) => setNewUser({ ...newUser, createHome: value })}
            label="Create a home directory"
            hint="Adds -m so the account gets /home/<name>."
          />
          <Toggle
            checked={newUser.sudo}
            onChange={(value) => setNewUser({ ...newUser, sudo: value })}
            label="Grant sudo access"
            hint="Adds the account to the sudo group. Only do this for people you trust with root."
            tone="warn"
          />
        </div>
      </Modal>

      <Modal
        open={dialog === 'password'}
        onClose={() => setDialog(null)}
        title={`Set a password for ${selected?.name ?? ''}`}
        subtitle="Piped to chpasswd over the encrypted channel, so it never appears in a command."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="users.setPassword"
              params={{ name: selected?.name, password }}
              variant="primary"
              size="sm"
              disabled={password.length < 8 || password !== password2}
              options={{ successMessage: 'Password updated' }}
              onDone={() => {
                setPassword('')
                setPassword2('')
                setDialog(null)
              }}
            >
              Set password
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label="New password"
            required
            error={password && password.length < 8 ? 'Use at least 8 characters.' : undefined}
          >
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Repeat password"
            required
            error={password2 && password !== password2 ? 'The two passwords do not match.' : undefined}
          >
            <Input
              type="password"
              value={password2}
              onChange={(event) => setPassword2(event.target.value)}
              autoComplete="new-password"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={dialog === 'addKey'}
        onClose={() => setDialog(null)}
        title={`Authorise an SSH key for ${selected?.name ?? ''}`}
        subtitle="Paste the public key, the one ending in .pub. Never the private half."
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="users.keys.add"
              params={{ name: selected?.name, key: keyText }}
              variant="primary"
              size="sm"
              disabled={!/^(ssh|ecdsa|sk-)/.test(keyText.trim())}
              options={{ successMessage: 'Key authorised' }}
              onDone={() => {
                setDialog(null)
                if (selected) void loadKeys(selected)
              }}
            >
              Authorise key
            </ActionButton>
          </>
        }
      >
        <Field
          label="Public key"
          required
          hint="Starts with ssh-ed25519, ssh-rsa, ecdsa-sha2-… or sk-ssh-…"
          error={
            keyText.trim() && !/^(ssh|ecdsa|sk-)/.test(keyText.trim())
              ? 'That does not look like an OpenSSH public key.'
              : undefined
          }
        >
          <Textarea
            rows={5}
            value={keyText}
            onChange={(event) => setKeyText(event.target.value)}
            placeholder="ssh-ed25519 AAAAC3Nza... you@laptop"
          />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'group'}
        onClose={() => setDialog(null)}
        title="Add a group"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="groups.create"
              params={{ name: groupName }}
              variant="primary"
              size="sm"
              disabled={!/^[a-z_][a-z0-9_-]*$/.test(groupName)}
              options={{ successMessage: `${groupName} created` }}
              onDone={afterChange}
            >
              Create group
            </ActionButton>
          </>
        }
      >
        <Field label="Group name" required>
          <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} mono />
        </Field>
      </Modal>
    </div>
  )
}
