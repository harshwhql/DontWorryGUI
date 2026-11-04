import type { RiskLevel, ServerFacts } from '@shared/types'
import type { ExecOptions, ExecOutcome, SshConnection } from '../ssh/connection'

export interface ActionContext {
  hostId: string
  conn: SshConnection
  facts: ServerFacts
  /** per-host scratch space (previous /proc/stat samples, net counters, ...) */
  cache: Map<string, unknown>
  exec(command: string, options?: ExecOptions): Promise<ExecOutcome>
}

export interface CustomResult<R> {
  data?: R
  /** the command string shown in the inspector */
  command: string
  /** copy/paste-friendly variant */
  plain?: string
  stdout?: string
  transport?: 'shell' | 'sftp'
  exitCode?: number | null
}

export interface ActionDef<P = any, R = any> {
  id: string
  label: string | ((params: P) => string)
  category: string
  risk: RiskLevel
  privileged?: boolean
  description?: string
  transport?: 'shell' | 'sftp'
  /** non-zero exit codes are expected (e.g. `ufw status` on a locked-down box) */
  allowFailure?: boolean
  timeoutMs?: number
  /** build the exact remote command */
  build?: (params: P, ctx: ActionContext) => string
  /** turn raw stdout into typed data for the renderer */
  parse?: (out: ExecOutcome, params: P, ctx: ActionContext) => R
  /** multi-step or SFTP-backed work */
  custom?: (params: P, ctx: ActionContext) => Promise<CustomResult<R>>
  /** required for `custom` actions so dry-run can still show the command */
  preview?: (params: P, ctx: ActionContext) => string
}

export function defineActions(defs: ActionDef[]): ActionDef[] {
  return defs
}

export function labelFor(def: ActionDef, params: unknown): string {
  return typeof def.label === 'function' ? def.label(params) : def.label
}
