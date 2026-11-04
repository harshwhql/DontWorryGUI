/**
 * Shared contracts between the Electron main process and the renderer.
 *
 * Every GUI action maps to exactly one declared shell command or SFTP call,
 * which is what makes the command log and dry run mode complete.
 */

export type RiskLevel = 'read' | 'write' | 'destructive'

export type AuthMethod = 'password' | 'key' | 'agent'

export interface HostConfig {
  id: string
  label: string
  host: string
  port: number
  username: string
  authMethod: AuthMethod
  /** stored encrypted at rest via Electron safeStorage */
  password?: string
  privateKeyPath?: string
  passphrase?: string
  /** sudo password; falls back to `password` when empty */
  sudoPassword?: string
  /** prefix privileged commands with sudo (ignored when logged in as root) */
  useSudo: boolean
  /** accent hue used to colour-code this host across the UI */
  accent: string
  group?: string
  notes?: string
  keepAliveSeconds: number
  createdAt: number
  lastConnectedAt?: number
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export interface ConnectionState {
  hostId: string
  status: ConnectionStatus
  message?: string
  connectedAt?: number
  facts?: ServerFacts
}

export type PackageManager =
  | 'apt'
  | 'dnf'
  | 'yum'
  | 'pacman'
  | 'zypper'
  | 'apk'
  | 'unknown'

export interface ServerFacts {
  hostname: string
  prettyName: string
  distroId: string
  version: string
  kernel: string
  arch: string
  cpuModel: string
  cpuCores: number
  totalMemBytes: number
  shell: string
  user: string
  isRoot: boolean
  hasSudo: boolean
  packageManager: PackageManager
  hasSystemd: boolean
  hasDocker: boolean
  dockerVersion?: string
  firewall: 'ufw' | 'firewalld' | 'iptables' | 'none'
  virtualization?: string
  bootTime?: number
}

// Command audit trail

export type CommandStatus = 'running' | 'success' | 'error' | 'dry-run'

export type CommandOrigin = 'gui' | 'terminal' | 'manual' | 'poll'

export interface CommandRecord {
  id: string
  hostId: string
  actionId: string
  label: string
  /** the literal string handed to the remote shell */
  command: string
  /** human note when the work was done over SFTP rather than a shell */
  transport: 'shell' | 'sftp'
  risk: RiskLevel
  origin: CommandOrigin
  status: CommandStatus
  startedAt: number
  finishedAt?: number
  durationMs?: number
  exitCode?: number | null
  stdout?: string
  stderr?: string
  truncated?: boolean
}

export interface ActionDescriptor {
  id: string
  label: string
  category: string
  risk: RiskLevel
  /** does this action need root? */
  privileged: boolean
  /** short description surfaced in the command inspector + palette */
  description?: string
}

export interface RunResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  record: CommandRecord
}

// Metrics

export interface CpuSample {
  usagePercent: number
  perCore: number[]
  loadAvg: [number, number, number]
}

export interface MemorySample {
  totalBytes: number
  usedBytes: number
  freeBytes: number
  availableBytes: number
  cachedBytes: number
  buffersBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
}

export interface DiskEntry {
  filesystem: string
  type: string
  mount: string
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usePercent: number
}

export interface NetSample {
  iface: string
  rxBytes: number
  txBytes: number
  rxRate: number
  txRate: number
}

export interface MetricsSnapshot {
  at: number
  uptimeSeconds: number
  cpu: CpuSample
  memory: MemorySample
  disks: DiskEntry[]
  net: NetSample[]
  processCount: number
  loggedInUsers: number
  temperatureC?: number
}

// Domain models

export interface ProcessEntry {
  pid: number
  ppid: number
  user: string
  cpu: number
  mem: number
  rssBytes: number
  state: string
  elapsedSeconds: number
  nice: number
  command: string
  fullCommand: string
}

export interface ServiceEntry {
  unit: string
  name: string
  load: string
  active: string
  sub: string
  description: string
  enabled?: string
}

export interface ServiceDetail {
  unit: string
  description: string
  activeState: string
  subState: string
  unitFileState: string
  mainPid?: number
  memoryBytes?: number
  cpuUsageNs?: number
  since?: string
  fragmentPath?: string
  execStart?: string
  restart?: string
}

export type FileKind = 'file' | 'directory' | 'symlink' | 'other'

export interface FileEntry {
  name: string
  path: string
  kind: FileKind
  sizeBytes: number
  modifiedAt: number
  mode: number
  modeString: string
  owner: string
  group: string
  uid: number
  gid: number
  linkTarget?: string
}

export interface PackageEntry {
  name: string
  version: string
  architecture?: string
  description?: string
  availableVersion?: string
}

export interface NetInterface {
  name: string
  state: string
  mac?: string
  mtu?: number
  addresses: { family: 'inet' | 'inet6'; address: string; prefix: number }[]
}

export interface ListeningPort {
  protocol: string
  localAddress: string
  port: number
  process?: string
  pid?: number
  state: string
}

export interface RouteEntry {
  destination: string
  gateway?: string
  dev?: string
  protocol?: string
  metric?: number
}

export interface FirewallRule {
  raw: string
  action?: string
  from?: string
  to?: string
  port?: string
}

export interface FirewallState {
  backend: 'ufw' | 'firewalld' | 'iptables' | 'none'
  active: boolean
  defaultIncoming?: string
  defaultOutgoing?: string
  rules: FirewallRule[]
}

export interface UserEntry {
  name: string
  uid: number
  gid: number
  home: string
  shell: string
  comment: string
  groups: string[]
  isSystem: boolean
  locked?: boolean
}

export interface GroupEntry {
  name: string
  gid: number
  members: string[]
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  command: string
  state: string
  status: string
  ports: string
  createdAt: string
  size?: string
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size: string
  createdSince: string
}

export interface DockerVolume {
  name: string
  driver: string
  mountpoint: string
}

export interface DockerStat {
  id: string
  name: string
  cpuPercent: number
  memUsage: string
  memPercent: number
  netIO: string
  blockIO: string
}

export interface LogLine {
  at?: number
  raw: string
  priority?: string
  unit?: string
}

export interface CronJob {
  id: string
  schedule: string
  command: string
  raw: string
  comment?: string
  enabled: boolean
  user: string
}

export interface TimerEntry {
  unit: string
  next: string
  left: string
  last: string
  activates: string
}

// Terminal

export interface TerminalSessionInfo {
  sessionId: string
  hostId: string
  title: string
}

export interface TerminalData {
  sessionId: string
  data: string
}

// Settings

export interface AppSettings {
  /** when true, write/destructive commands are shown but never executed */
  dryRun: boolean
  /** ask before every write/destructive action */
  confirmWrites: boolean
  confirmDestructive: boolean
  pollIntervalMs: number
  showCommandInspector: boolean
  terminalFontSize: number
  reduceMotion: boolean
  accent: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  dryRun: false,
  confirmWrites: false,
  confirmDestructive: true,
  pollIntervalMs: 3000,
  showCommandInspector: true,
  terminalFontSize: 13,
  reduceMotion: false,
  accent: 'emerald'
}
