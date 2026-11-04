import type { FileEntry, FileKind } from '@shared/types'
import type { ActionContext } from './types'
import { q } from './system'
import { joinRemote, modeToString } from '../ssh/sftp-helpers'

/**
 * SFTP runs as the logged-in account and cannot escalate, so a sudo user hits
 * "permission denied" on anything root-only, which is most of /etc, /var and
 * /root. These fallbacks redo the same work through the shell, where sudo does
 * apply, using `find -printf` and `base64` so the output stays machine-readable
 * instead of scraped from `ls`.
 */

export function isPermissionError(err: unknown): boolean {
  const message = (err as Error)?.message ?? ''
  const code = (err as { code?: number }).code
  // ssh2 sftp status 3 is SSH_FX_PERMISSION_DENIED
  return code === 3 || /permission denied|EACCES|No such file.*denied/i.test(message)
}

const KIND_BY_FIND_TYPE: Record<string, FileKind> = {
  f: 'file',
  d: 'directory',
  l: 'symlink'
}

const MODE_TYPE_BITS: Record<string, number> = {
  f: 0o100000,
  d: 0o040000,
  l: 0o120000,
  b: 0o060000,
  c: 0o020000,
  p: 0o010000,
  s: 0o140000
}

export const LIST_COMMAND = (path: string): string =>
  `find ${q(path)} -maxdepth 1 -mindepth 1 -printf '%y\\t%s\\t%T@\\t%m\\t%u\\t%g\\t%U\\t%G\\t%f\\t%l\\n'`

export async function listViaShell(
  path: string,
  ctx: ActionContext
): Promise<{ entries: FileEntry[]; command: string }> {
  const command = LIST_COMMAND(path)
  const out = await ctx.exec(command, { privileged: true, timeoutMs: 60_000 })
  if (out.code !== 0) {
    throw new Error(
      out.stderr.split('\n').find((line) => line.trim())?.trim() ||
        `Could not list ${path} (exit ${out.code})`
    )
  }

  const entries: FileEntry[] = []
  for (const line of out.stdout.split('\n')) {
    if (!line.trim()) continue
    const [type, size, mtime, mode, owner, group, uid, gid, name, linkTarget] = line.split('\t')
    if (!name) continue
    const numericMode = parseInt(mode, 8) || 0
    entries.push({
      name,
      path: joinRemote(path, name),
      kind: KIND_BY_FIND_TYPE[type] ?? 'other',
      sizeBytes: Number(size) || 0,
      modifiedAt: Math.round(Number(mtime) * 1000) || 0,
      mode: numericMode,
      modeString: modeToString(numericMode | (MODE_TYPE_BITS[type] ?? 0)),
      owner: owner || uid,
      group: group || gid,
      uid: Number(uid) || 0,
      gid: Number(gid) || 0,
      linkTarget: linkTarget || undefined
    })
  }

  entries.sort((a, b) => {
    const aDir = a.kind === 'directory' ? 0 : 1
    const bDir = b.kind === 'directory' ? 0 : 1
    if (aDir !== bDir) return aDir - bDir
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  return { entries, command: out.executed }
}

export async function readViaShell(
  path: string,
  ctx: ActionContext
): Promise<{ buffer: Buffer; command: string }> {
  // base64 so binary content survives the shell round trip intact
  const out = await ctx.exec(`base64 -w0 ${q(path)}`, { privileged: true, timeoutMs: 120_000 })
  if (out.code !== 0) {
    throw new Error(
      out.stderr.split('\n').find((line) => line.trim())?.trim() ||
        `Could not read ${path} (exit ${out.code})`
    )
  }
  return { buffer: Buffer.from(out.stdout.trim(), 'base64'), command: out.executed }
}

export async function writeViaShell(
  path: string,
  content: string,
  ctx: ActionContext
): Promise<{ command: string }> {
  // tee takes the body on stdin, so the file contents never enter the command
  const out = await ctx.exec(`tee ${q(path)} > /dev/null`, {
    privileged: true,
    stdin: content,
    timeoutMs: 120_000
  })
  if (out.code !== 0) {
    throw new Error(
      out.stderr.split('\n').find((line) => line.trim())?.trim() ||
        `Could not write ${path} (exit ${out.code})`
    )
  }
  return { command: `${out.executed}   # ${Buffer.byteLength(content)} bytes piped on stdin` }
}
