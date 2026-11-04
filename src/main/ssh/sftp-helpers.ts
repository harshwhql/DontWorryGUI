import type { SFTPWrapper, FileEntryWithStats, Stats } from 'ssh2'
import type { FileEntry, FileKind } from '@shared/types'

const S_IFMT = 0xf000
const TYPE_CHARS: Record<number, string> = {
  0x8000: '-',
  0x4000: 'd',
  0xa000: 'l',
  0x2000: 'c',
  0x6000: 'b',
  0x1000: 'p',
  0xc000: 's'
}

export function fileKind(mode: number): FileKind {
  switch (mode & S_IFMT) {
    case 0x4000:
      return 'directory'
    case 0xa000:
      return 'symlink'
    case 0x8000:
      return 'file'
    default:
      return 'other'
  }
}

export function modeToString(mode: number): string {
  const type = TYPE_CHARS[mode & S_IFMT] ?? '-'
  const bit = (value: number, flag: number, char: string): string => (value & flag ? char : '-')
  const owner = (mode >> 6) & 7
  const group = (mode >> 3) & 7
  const other = mode & 7
  const setuid = (mode & 0o4000) !== 0
  const setgid = (mode & 0o2000) !== 0
  const sticky = (mode & 0o1000) !== 0

  const trio = (value: number, special: boolean, specialChar: string): string =>
    bit(value, 4, 'r') +
    bit(value, 2, 'w') +
    (special ? (value & 1 ? specialChar : specialChar.toUpperCase()) : bit(value, 1, 'x'))

  return type + trio(owner, setuid, 's') + trio(group, setgid, 's') + trio(other, sticky, 't')
}

export function joinRemote(dir: string, name: string): string {
  if (!dir || dir === '/') return `/${name}`
  return `${dir.replace(/\/+$/, '')}/${name}`
}

export function parentOf(path: string): string {
  if (!path || path === '/') return '/'
  const trimmed = path.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

/** `longname` is an ls -l line; it is the only place SFTP hands us real owner names. */
function ownerFromLongname(longname: string): { owner?: string; group?: string } {
  const parts = longname.trim().split(/\s+/)
  if (parts.length < 4) return {}
  return { owner: parts[2], group: parts[3] }
}

export function readdir(sftp: SFTPWrapper, path: string): Promise<FileEntryWithStats[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(path, (err, list) => (err ? reject(err) : resolve(list)))
  })
}

export function stat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (err, stats) => (err ? reject(err) : resolve(stats)))
  })
}

export function lstat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.lstat(path, (err, stats) => (err ? reject(err) : resolve(stats)))
  })
}

export function readlink(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.readlink(path, (err, target) => (err ? reject(err) : resolve(target)))
  })
}

export function realpath(sftp: SFTPWrapper, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.realpath(path, (err, resolved) => (err ? reject(err) : resolve(resolved)))
  })
}

export function readFileRemote(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(path)
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('close', () => resolve(Buffer.concat(chunks)))
  })
}

export function writeFileRemote(sftp: SFTPWrapper, path: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = sftp.createWriteStream(path)
    stream.on('error', reject)
    stream.on('close', () => resolve())
    stream.end(data)
  })
}

export function fastGet(
  sftp: SFTPWrapper,
  remote: string,
  local: string,
  onProgress?: (transferred: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastGet(
      remote,
      local,
      { step: (transferred, _c, total) => onProgress?.(transferred, total) },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

export function fastPut(
  sftp: SFTPWrapper,
  local: string,
  remote: string,
  onProgress?: (transferred: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.fastPut(
      local,
      remote,
      { step: (transferred, _c, total) => onProgress?.(transferred, total) },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

export async function toFileEntries(
  sftp: SFTPWrapper,
  dir: string,
  list: FileEntryWithStats[]
): Promise<FileEntry[]> {
  const entries: FileEntry[] = list.map((item) => {
    const mode = item.attrs.mode ?? 0
    const { owner, group } = ownerFromLongname(item.longname ?? '')
    return {
      name: item.filename,
      path: joinRemote(dir, item.filename),
      kind: fileKind(mode),
      sizeBytes: item.attrs.size ?? 0,
      modifiedAt: (item.attrs.mtime ?? 0) * 1000,
      mode: mode & 0o7777,
      modeString: modeToString(mode),
      owner: owner ?? String(item.attrs.uid ?? ''),
      group: group ?? String(item.attrs.gid ?? ''),
      uid: item.attrs.uid ?? 0,
      gid: item.attrs.gid ?? 0
    }
  })

  // resolve symlink targets so the UI can show "link → target"
  const links = entries.filter((e) => e.kind === 'symlink').slice(0, 200)
  await Promise.all(
    links.map(async (entry) => {
      try {
        entry.linkTarget = await readlink(sftp, entry.path)
      } catch {
        /* dangling or unreadable link */
      }
    })
  )

  return entries.sort((a, b) => {
    const aDir = a.kind === 'directory' ? 0 : 1
    const bDir = b.kind === 'directory' ? 0 : 1
    if (aDir !== bDir) return aDir - bDir
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}
