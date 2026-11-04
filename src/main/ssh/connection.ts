import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { Client, type ClientChannel, type SFTPWrapper, type ConnectConfig } from 'ssh2'
import type { HostConfig, ServerFacts, PackageManager } from '@shared/types'
import { FACTS_SCRIPT, parseFacts } from './facts'

export interface ExecOptions {
  /** wrap with sudo when the session is not already root */
  privileged?: boolean
  stdin?: string
  timeoutMs?: number
  /** cap captured output (default 2 MiB) */
  maxBytes?: number
  /** allocate a pty, needed for interactive tools */
  pty?: boolean
}

export interface ExecOutcome {
  stdout: string
  stderr: string
  code: number | null
  signal?: string
  /** the literal string handed to the remote shell */
  executed: string
  /** the same command without the sudo stdin plumbing, for copy/paste */
  plain: string
  truncated: boolean
}

export class SshError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message)
    this.name = 'SshError'
  }
}

/** POSIX single-quote a string so it survives `sh -c`. */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

export class SshConnection extends EventEmitter {
  private client: Client | null = null
  private sftpHandle: SFTPWrapper | null = null
  private sftpPromise: Promise<SFTPWrapper> | null = null
  facts: ServerFacts | null = null
  ready = false

  constructor(public config: HostConfig) {
    super()
  }

  // lifecycle

  async connect(): Promise<ServerFacts> {
    if (this.ready && this.facts) return this.facts

    const cfg: ConnectConfig = {
      host: this.config.host,
      port: this.config.port || 22,
      username: this.config.username,
      readyTimeout: 20_000,
      keepaliveInterval: Math.max(5, this.config.keepAliveSeconds || 20) * 1000,
      keepaliveCountMax: 4
    }

    if (this.config.authMethod === 'password') {
      cfg.password = this.config.password ?? ''
      cfg.tryKeyboard = true
    } else if (this.config.authMethod === 'key') {
      if (!this.config.privateKeyPath) {
        throw new SshError('No private key file selected for this host.')
      }
      try {
        cfg.privateKey = await readFile(this.config.privateKeyPath)
      } catch (err) {
        throw new SshError(
          `Could not read private key at ${this.config.privateKeyPath}`,
          (err as Error).message
        )
      }
      if (this.config.passphrase) cfg.passphrase = this.config.passphrase
    } else {
      cfg.agent = process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? 'pageant' : undefined)
      if (!cfg.agent) {
        throw new SshError(
          'No SSH agent found. Set SSH_AUTH_SOCK, or switch this host to key/password auth.'
        )
      }
    }

    const client = new Client()
    this.client = client

    await new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        cleanup()
        resolve()
      }
      const onError = (err: Error & { level?: string }): void => {
        cleanup()
        reject(new SshError(humanizeConnectError(err), err.message))
      }
      const cleanup = (): void => {
        client.off('ready', onReady)
        client.off('error', onError)
      }
      client.once('ready', onReady)
      client.once('error', onError)
      client.on('keyboard-interactive', (_n, _i, _l, prompts, finish) => {
        finish(prompts.map(() => this.config.password ?? ''))
      })
      client.connect(cfg)
    })

    client.on('error', (err) => this.emit('error', err))
    client.on('close', () => {
      this.ready = false
      this.sftpHandle = null
      this.sftpPromise = null
      this.emit('close')
    })
    client.on('end', () => {
      this.ready = false
      this.emit('close')
    })

    this.ready = true
    this.facts = await this.detectFacts()
    return this.facts
  }

  dispose(): void {
    this.ready = false
    this.sftpHandle = null
    this.sftpPromise = null
    try {
      this.client?.end()
    } catch {
      /* already gone */
    }
    this.client = null
    this.removeAllListeners()
  }

  // exec

  private sudoPrefix(): { prefix: string; password: string } | null {
    if (!this.config.useSudo) return null
    if (this.facts?.isRoot) return null
    const password = this.config.sudoPassword || this.config.password || ''
    return { prefix: `sudo -S -p '' `, password }
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecOutcome> {
    if (!this.client || !this.ready) throw new SshError('Not connected.')

    let executed = command
    let plain = command
    let stdin = options.stdin ?? ''

    if (options.privileged) {
      const sudo = this.sudoPrefix()
      if (sudo) {
        executed = `${sudo.prefix}sh -c ${shQuote(command)}`
        plain = `sudo sh -c ${shQuote(command)}`
        stdin = `${sudo.password}\n${stdin}`
      }
    }

    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    const client = this.client

    return new Promise<ExecOutcome>((resolve, reject) => {
      client.exec(executed, { pty: options.pty ?? false }, (err, stream) => {
        if (err) return reject(new SshError(err.message))

        const out: Buffer[] = []
        const errOut: Buffer[] = []
        let outLen = 0
        let errLen = 0
        let truncated = false
        let code: number | null = null
        let signal: string | undefined
        let settled = false

        const timer = options.timeoutMs
          ? setTimeout(() => {
              if (settled) return
              settled = true
              try {
                stream.close()
              } catch {
                /* noop */
              }
              reject(new SshError(`Command timed out after ${options.timeoutMs}ms`))
            }, options.timeoutMs)
          : null

        stream.on('data', (chunk: Buffer) => {
          if (outLen >= maxBytes) {
            truncated = true
            return
          }
          out.push(chunk)
          outLen += chunk.length
        })
        stream.stderr.on('data', (chunk: Buffer) => {
          if (errLen >= maxBytes) {
            truncated = true
            return
          }
          errOut.push(chunk)
          errLen += chunk.length
        })
        stream.on('exit', (c: number | null, s?: string) => {
          code = c
          signal = s
        })
        stream.on('close', () => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          resolve({
            stdout: Buffer.concat(out).toString('utf8'),
            stderr: Buffer.concat(errOut).toString('utf8'),
            code,
            signal,
            executed,
            plain,
            truncated
          })
        })
        stream.on('error', (e: Error) => {
          if (settled) return
          settled = true
          if (timer) clearTimeout(timer)
          reject(new SshError(e.message))
        })

        if (stdin) stream.write(stdin)
        stream.end()
      })
    })
  }

  /** exec and throw when the exit code is non-zero */
  async execOrThrow(command: string, options: ExecOptions = {}): Promise<ExecOutcome> {
    const result = await this.exec(command, options)
    if (result.code !== 0) {
      throw new SshError(
        firstLine(result.stderr) || firstLine(result.stdout) || `Exited with code ${result.code}`,
        result.stderr || result.stdout
      )
    }
    return result
  }

  // sftp

  async sftp(): Promise<SFTPWrapper> {
    if (this.sftpHandle) return this.sftpHandle
    if (this.sftpPromise) return this.sftpPromise
    if (!this.client) throw new SshError('Not connected.')

    this.sftpPromise = new Promise<SFTPWrapper>((resolve, reject) => {
      this.client!.sftp((err, sftp) => {
        if (err) {
          this.sftpPromise = null
          return reject(new SshError(`SFTP unavailable: ${err.message}`))
        }
        this.sftpHandle = sftp
        sftp.on('close', () => {
          this.sftpHandle = null
          this.sftpPromise = null
        })
        resolve(sftp)
      })
    })
    return this.sftpPromise
  }

  // interactive shell

  async shell(cols: number, rows: number): Promise<ClientChannel> {
    if (!this.client || !this.ready) throw new SshError('Not connected.')
    const client = this.client
    return new Promise<ClientChannel>((resolve, reject) => {
      client.shell(
        { term: 'xterm-256color', cols, rows, width: cols * 8, height: rows * 17 },
        (err, stream) => (err ? reject(new SshError(err.message)) : resolve(stream))
      )
    })
  }

  // facts

  private async detectFacts(): Promise<ServerFacts> {
    const res = await this.exec(FACTS_SCRIPT, { timeoutMs: 25_000 })
    const map = parseFacts(res.stdout)

    const pm = (map.get('pm') || 'unknown') as PackageManager
    const uid = Number(map.get('uid') ?? '-1')
    const dockerLine = map.get('docker') || ''

    return {
      hostname: map.get('host') || this.config.host,
      prettyName: map.get('pretty') || map.get('distro') || 'Unknown Linux',
      distroId: map.get('distro') || 'unknown',
      version: map.get('ver') || '',
      kernel: map.get('kernel') || '',
      arch: map.get('arch') || '',
      cpuModel: map.get('cpumodel') || 'Unknown CPU',
      cpuCores: Number(map.get('cores') || '1') || 1,
      totalMemBytes: Number(map.get('memtotal') || '0'),
      shell: map.get('shell') || '/bin/sh',
      user: map.get('user') || this.config.username,
      isRoot: uid === 0,
      hasSudo: map.get('sudo') === '1',
      packageManager: pm,
      hasSystemd: map.get('systemd') === '1',
      hasDocker: Boolean(dockerLine),
      dockerVersion: dockerLine || undefined,
      firewall: (map.get('fw') as ServerFacts['firewall']) || 'none',
      virtualization: map.get('virt') || undefined,
      bootTime: Date.now() - Number(map.get('boot') || '0') * 1000
    }
  }
}

function firstLine(text: string): string {
  return (text || '').split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
}

function humanizeConnectError(err: Error & { level?: string }): string {
  const msg = err.message || ''
  if (/All configured authentication methods failed/i.test(msg))
    return 'Authentication failed — check the username, password or key.'
  if (/ECONNREFUSED/.test(msg)) return 'Connection refused — is sshd running on that port?'
  if (/ENOTFOUND|EAI_AGAIN/.test(msg)) return 'Host not found — check the address.'
  if (/ETIMEDOUT|Timed out while waiting/i.test(msg))
    return 'Timed out reaching the host — check the network or firewall.'
  if (/ECONNRESET/.test(msg)) return 'Connection reset by the server.'
  if (/Cannot parse privateKey|bad decrypt/i.test(msg))
    return 'Could not read that private key — a passphrase may be required.'
  return msg || 'Connection failed.'
}
