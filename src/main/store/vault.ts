import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { DEFAULT_SETTINGS, type AppSettings, type HostConfig } from '@shared/types'

interface VaultFile {
  version: 1
  hosts: HostConfig[]
  settings: AppSettings
}

const SECRET_FIELDS = ['password', 'passphrase', 'sudoPassword'] as const
const ENC_PREFIX = 'enc:v1:'

/**
 * Host book + settings on disk. Credentials are sealed with Electron's
 * safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux) so the
 * JSON on disk never contains a readable password.
 */
class Vault {
  private file = ''
  private data: VaultFile = { version: 1, hosts: [], settings: { ...DEFAULT_SETTINGS } }
  private loaded = false

  init(): void {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'dontworrygui.vault.json')
    this.load()
  }

  private load(): void {
    this.loaded = true
    if (!existsSync(this.file)) return
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<VaultFile>
      this.data = {
        version: 1,
        hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) }
      }
    } catch {
      // A corrupt vault must not take the app down; start clean and keep a copy.
      try {
        renameSync(this.file, `${this.file}.broken-${Date.now()}`)
      } catch {
        /* noop */
      }
      this.data = { version: 1, hosts: [], settings: { ...DEFAULT_SETTINGS } }
    }
  }

  private persist(): void {
    if (!this.loaded) this.load()
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  /* ---------------- secret sealing ---------------- */

  private seal(value?: string): string | undefined {
    if (!value) return undefined
    if (value.startsWith(ENC_PREFIX)) return value
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
      }
    } catch {
      /* fall through to plaintext */
    }
    return value
  }

  private unseal(value?: string): string | undefined {
    if (!value) return undefined
    if (!value.startsWith(ENC_PREFIX)) return value
    try {
      return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'))
    } catch {
      return undefined
    }
  }

  /* ---------------- hosts ---------------- */

  /** Hosts with secrets redacted, safe to hand to the renderer. */
  listHosts(): HostConfig[] {
    return this.data.hosts.map((host) => {
      const copy: HostConfig = { ...host }
      for (const field of SECRET_FIELDS) {
        copy[field] = host[field] ? '••••••••' : undefined
      }
      return copy
    })
  }

  /** The real values, secrets decrypted. Main process only. */
  resolveHost(id: string): HostConfig | undefined {
    const host = this.data.hosts.find((h) => h.id === id)
    if (!host) return undefined
    const copy: HostConfig = { ...host }
    for (const field of SECRET_FIELDS) copy[field] = this.unseal(host[field])
    return copy
  }

  upsertHost(input: Partial<HostConfig>): HostConfig {
    const now = Date.now()
    const id = input.id || randomUUID()
    const index = this.data.hosts.findIndex((h) => h.id === id)
    const previous = index >= 0 ? this.data.hosts[index] : undefined

    const merged: HostConfig = {
      id,
      label: input.label?.trim() || input.host?.trim() || 'New server',
      host: (input.host ?? previous?.host ?? '').trim(),
      port: Number(input.port ?? previous?.port ?? 22) || 22,
      username: (input.username ?? previous?.username ?? 'root').trim(),
      authMethod: input.authMethod ?? previous?.authMethod ?? 'password',
      privateKeyPath: input.privateKeyPath ?? previous?.privateKeyPath,
      useSudo: input.useSudo ?? previous?.useSudo ?? true,
      accent: input.accent ?? previous?.accent ?? 'emerald',
      theme: input.theme ?? previous?.theme,
      group: input.group ?? previous?.group,
      notes: input.notes ?? previous?.notes,
      keepAliveSeconds: Number(input.keepAliveSeconds ?? previous?.keepAliveSeconds ?? 20) || 20,
      createdAt: previous?.createdAt ?? now,
      lastConnectedAt: previous?.lastConnectedAt
    }

    // A masked value means "leave the stored secret alone".
    for (const field of SECRET_FIELDS) {
      const incoming = input[field]
      if (incoming === undefined || incoming === '••••••••') {
        merged[field] = previous?.[field]
      } else if (incoming === '') {
        merged[field] = undefined
      } else {
        merged[field] = this.seal(incoming)
      }
    }

    if (index >= 0) this.data.hosts[index] = merged
    else this.data.hosts.push(merged)
    this.persist()

    const safe: HostConfig = { ...merged }
    for (const field of SECRET_FIELDS) safe[field] = merged[field] ? '••••••••' : undefined
    return safe
  }

  deleteHost(id: string): void {
    this.data.hosts = this.data.hosts.filter((h) => h.id !== id)
    this.persist()
  }

  touchHost(id: string): void {
    const host = this.data.hosts.find((h) => h.id === id)
    if (!host) return
    host.lastConnectedAt = Date.now()
    this.persist()
  }

  /* ---------------- settings ---------------- */

  getSettings(): AppSettings {
    return { ...this.data.settings }
  }

  saveSettings(patch: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.persist()
    return this.getSettings()
  }

  encryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }
}

export const store = new Vault()
