import { useEffect, useState } from 'react'
import { FileKey, FolderOpen, KeyRound, Lock, Trash2, UserRound } from 'lucide-react'
import type { AuthMethod, HostConfig } from '@shared/types'
import { getTheme } from '@shared/themes'
import { api } from '../../lib/api'
import { ThemePicker } from '../../components/ThemePicker'
import { cn } from '../../lib/format'
import { Button, Field, Input, Segmented, Toggle } from '../../components/ui/primitives'
import { Modal } from '../../components/ui/overlay'
import { useApp } from '../../state/store'

const ACCENTS = [
  { id: 'emerald', cls: 'bg-run' },
  { id: 'blue', cls: 'bg-info' },
  { id: 'violet', cls: 'bg-root' },
  { id: 'amber', cls: 'bg-warn' },
  { id: 'rose', cls: 'bg-danger' },
  { id: 'slate', cls: 'bg-ink-faint' }
]

type Draft = Partial<HostConfig>

export function HostForm({
  open,
  host,
  onClose
}: {
  open: boolean
  host: HostConfig | null
  onClose: () => void
}): React.JSX.Element {
  const saveHost = useApp((s) => s.saveHost)
  const deleteHost = useApp((s) => s.deleteHost)
  const connect = useApp((s) => s.connect)
  const toast = useApp((s) => s.toast)
  const askConfirm = useApp((s) => s.askConfirm)
  const defaultTheme = useApp((s) => s.settings.defaultTheme)

  const [draft, setDraft] = useState<Draft>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setDraft(
      host ?? {
        label: '',
        host: '',
        port: 22,
        username: 'root',
        authMethod: 'password',
        useSudo: true,
        accent: 'emerald',
        keepAliveSeconds: 20
      }
    )
  }, [open, host])

  const set = <K extends keyof HostConfig>(key: K, value: HostConfig[K]): void =>
    setDraft((prev) => ({ ...prev, [key]: value }))

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!draft.host?.trim()) next.host = 'Enter a hostname or IP address.'
    if (!draft.username?.trim()) next.username = 'Enter the account to sign in as.'
    const port = Number(draft.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) next.port = 'Ports run from 1 to 65535.'
    if (draft.authMethod === 'key' && !draft.privateKeyPath?.trim())
      next.privateKeyPath = 'Choose the private key file to sign in with.'
    if (draft.authMethod === 'password' && !draft.password)
      next.password = 'Enter the password, or switch to key authentication.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async (thenConnect: boolean): Promise<void> => {
    if (!validate()) return
    setBusy(true)
    try {
      const saved = await saveHost(draft)
      toast({ tone: 'success', title: `Saved ${saved.label}` })
      onClose()
      if (thenConnect) await connect(saved.id)
    } catch (err) {
      toast({ tone: 'error', title: 'Could not save', message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const pickKey = async (): Promise<void> => {
    const files = await api.dialog.pickFile({ title: 'Choose a private key' })
    if (files[0]) set('privateKeyPath', files[0])
  }

  const remove = async (): Promise<void> => {
    if (!host) return
    const ok = await askConfirm({
      title: `Remove ${host.label} from the host book?`,
      body: 'The server itself is untouched. This only forgets the connection details stored here.',
      command: `# local only: delete host ${host.id}`,
      risk: 'destructive',
      confirmLabel: 'Remove server'
    })
    if (!ok) return
    await deleteHost(host.id)
    toast({ tone: 'success', title: `Removed ${host.label}` })
    onClose()
  }

  const authMethod = (draft.authMethod ?? 'password') as AuthMethod

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={host ? `Edit ${host.label}` : 'Add a server'}
      subtitle="Credentials are sealed with your operating system keystore and never leave this machine."
      width="max-w-2xl"
      footer={
        <>
          {host ? (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => void remove()}>
              Remove
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => void save(false)}>
            Save
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save(true)}>
            Save &amp; connect
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* identity */}
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Display name" hint="What you want to call this server in the app.">
            <Input
              value={draft.label ?? ''}
              onChange={(event) => set('label', event.target.value)}
              placeholder={draft.host || 'production-web-01'}
            />
          </Field>
          <Field label="Colour tag">
            <div className="flex h-8 items-center gap-1.5">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  aria-label={`Use the ${accent.id} tag`}
                  aria-pressed={draft.accent === accent.id}
                  onClick={() => set('accent', accent.id)}
                  className={cn(
                    'size-5 rounded-md ring-offset-2 ring-offset-raised transition-transform hover:scale-110',
                    accent.cls,
                    draft.accent === accent.id ? 'ring-2 ring-ink-dim' : 'opacity-60'
                  )}
                />
              ))}
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_90px] gap-3">
          <Field label="Host" required error={errors.host} hint="Hostname or IP address of the server.">
            <Input
              value={draft.host ?? ''}
              onChange={(event) => set('host', event.target.value)}
              placeholder="10.0.0.12 or app.example.com"
              autoComplete="off"
              mono
            />
          </Field>
          <Field label="Port" required error={errors.port}>
            <Input
              type="number"
              min={1}
              max={65535}
              value={draft.port ?? 22}
              onChange={(event) => set('port', Number(event.target.value))}
              mono
            />
          </Field>
        </div>

        <Field label="Sign in as" required error={errors.username}>
          <div className="relative">
            <UserRound
              size={12}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
              aria-hidden
            />
            <Input
              value={draft.username ?? ''}
              onChange={(event) => set('username', event.target.value)}
              className="pl-7"
              autoComplete="off"
              mono
            />
          </div>
        </Field>

        {/* auth */}
        <div className="rounded-lg border border-line bg-void/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-ink-dim">Authentication</span>
            <Segmented
              value={authMethod}
              onChange={(value) => set('authMethod', value)}
              options={[
                { value: 'password', label: 'Password', icon: Lock },
                { value: 'key', label: 'Private key', icon: FileKey },
                { value: 'agent', label: 'SSH agent', icon: KeyRound }
              ]}
            />
          </div>

          {authMethod === 'password' ? (
            <Field
              label="Password"
              error={errors.password}
              hint={host?.password ? 'Leave the dots in place to keep the stored password.' : undefined}
            >
              <Input
                type="password"
                value={draft.password ?? ''}
                onChange={(event) => set('password', event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          ) : authMethod === 'key' ? (
            <div className="flex flex-col gap-3">
              <Field label="Private key file" required error={errors.privateKeyPath}>
                <div className="flex gap-1.5">
                  <Input
                    value={draft.privateKeyPath ?? ''}
                    onChange={(event) => set('privateKeyPath', event.target.value)}
                    placeholder="C:\Users\you\.ssh\id_ed25519"
                    mono
                  />
                  <Button variant="outline" icon={FolderOpen} onClick={() => void pickKey()}>
                    Browse
                  </Button>
                </div>
              </Field>
              <Field label="Key passphrase" hint="Only needed if the key is encrypted.">
                <Input
                  type="password"
                  value={draft.passphrase ?? ''}
                  onChange={(event) => set('passphrase', event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          ) : (
            <p className="text-[11.5px] leading-relaxed text-ink-faint">
              Uses the SSH agent already running on this machine: Pageant on Windows, or whatever{' '}
              <code className="text-ink-dim">SSH_AUTH_SOCK</code> points at elsewhere. No secret is
              stored by this app.
            </p>
          )}
        </div>

        {/* privilege */}
        <div className="rounded-lg border border-line bg-void/40 p-3">
          <Toggle
            checked={draft.useSudo ?? true}
            onChange={(value) => set('useSudo', value)}
            label="Use sudo for privileged commands"
            hint="Ignored when you sign in as root. Every sudo command still shows up in the command log."
          />
          {draft.useSudo ? (
            <div className="mt-3">
              <Field
                label="Sudo password"
                hint="Leave empty to reuse the sign-in password. Piped on stdin, never written into a command."
              >
                <Input
                  type="password"
                  value={draft.sudoPassword ?? ''}
                  onChange={(event) => set('sudoPassword', event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Group" hint="Optional label for grouping servers.">
            <Input
              value={draft.group ?? ''}
              onChange={(event) => set('group', event.target.value)}
              placeholder="production"
            />
          </Field>
          <Field label="Keep-alive" hint="Seconds between keep-alive packets.">
            <Input
              type="number"
              min={5}
              max={300}
              value={draft.keepAliveSeconds ?? 20}
              onChange={(event) => set('keepAliveSeconds', Number(event.target.value))}
              mono
            />
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-void/40 p-3">
          <p className="mb-2 text-[11px] font-medium text-ink-dim">
            Theme for this server
            <span className="ml-1.5 font-normal text-ink-ghost">
              applied whenever it is the active server
            </span>
          </p>
          <ThemePicker
            value={draft.theme}
            onChange={(next) => setDraft((prev) => ({ ...prev, theme: next }))}
            allowInherit
            inheritLabel={getTheme(defaultTheme).label}
            columns={4}
          />
        </div>

        <Field label="Notes" hint="Anything you want to remember about this box.">
          <Input value={draft.notes ?? ''} onChange={(event) => set('notes', event.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
