import type { FileEntry } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { q } from './system'
import {
  fastGet,
  fastPut,
  joinRemote,
  readFileRemote,
  readdir,
  realpath,
  toFileEntries,
  writeFileRemote
} from '../ssh/sftp-helpers'
import {
  isPermissionError,
  listViaShell,
  readViaShell,
  writeViaShell
} from './files-fallback'

const TEXT_LIMIT = 2 * 1024 * 1024

export const fileActions = defineActions([
  {
    id: 'files.list',
    label: (p: { path: string }) => `Open ${p.path}`,
    category: 'Files',
    risk: 'read',
    transport: 'sftp',
    description: 'Directory contents with permissions, owner and size.',
    preview: (p: { path: string }) => `ls -la --time-style=long-iso ${q(p.path)}`,
    custom: async (p: { path: string }, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      const resolved = p.path === '~' ? await realpath(sftp, '.') : p.path
      try {
        const list = await readdir(sftp, resolved)
        const entries = await toFileEntries(sftp, resolved, list)
        return {
          data: { path: resolved, entries } as { path: string; entries: FileEntry[] },
          command: `sftp readdir ${resolved}`,
          plain: `ls -la --time-style=long-iso ${q(resolved)}`,
          transport: 'sftp' as const,
          stdout: `${entries.length} entries`
        }
      } catch (err) {
        if (!isPermissionError(err)) throw err
        // SFTP cannot sudo; retry through the shell, which can
        const viaShell = await listViaShell(resolved, ctx)
        return {
          data: { path: resolved, entries: viaShell.entries } as {
            path: string
            entries: FileEntry[]
          },
          command: viaShell.command,
          plain: `sudo ls -la --time-style=long-iso ${q(resolved)}`,
          transport: 'shell' as const,
          stdout: `${viaShell.entries.length} entries (SFTP was denied, re-read with sudo)`
        }
      }
    }
  },
  {
    id: 'files.home',
    label: 'Find the home directory',
    category: 'Files',
    risk: 'read',
    transport: 'sftp',
    preview: () => `pwd`,
    custom: async (_p, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      const home = await realpath(sftp, '.')
      return { data: home, command: `sftp realpath .`, plain: 'pwd', transport: 'sftp' as const, stdout: home }
    }
  },
  {
    id: 'files.read',
    label: (p: { path: string }) => `Read ${p.path}`,
    category: 'Files',
    risk: 'read',
    transport: 'sftp',
    preview: (p: { path: string }) => `cat ${q(p.path)}`,
    custom: async (p: { path: string }, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      let buffer: Buffer
      let command = `sftp read ${p.path}`
      let transport: 'sftp' | 'shell' = 'sftp'
      try {
        buffer = await readFileRemote(sftp, p.path)
      } catch (err) {
        if (!isPermissionError(err)) throw err
        const viaShell = await readViaShell(p.path, ctx)
        buffer = viaShell.buffer
        command = viaShell.command
        transport = 'shell'
      }
      const truncated = buffer.length > TEXT_LIMIT
      const slice = truncated ? buffer.subarray(0, TEXT_LIMIT) : buffer
      // crude but effective binary sniff
      const isBinary = slice.subarray(0, 4096).includes(0)
      return {
        data: {
          path: p.path,
          content: isBinary ? '' : slice.toString('utf8'),
          sizeBytes: buffer.length,
          truncated,
          binary: isBinary
        },
        command,
        plain: `cat ${q(p.path)}`,
        transport,
        stdout: `${buffer.length} bytes read${transport === 'shell' ? ' (SFTP was denied, re-read with sudo)' : ''}`
      }
    }
  },
  {
    id: 'files.write',
    label: (p: { path: string }) => `Save ${p.path}`,
    category: 'Files',
    risk: 'write',
    transport: 'sftp',
    description: 'Overwrites the file on the server with the editor contents.',
    preview: (p: { path: string }) => `# write ${p.path} (via SFTP)`,
    custom: async (p: { path: string; content: string }, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      const data = Buffer.from(p.content ?? '', 'utf8')
      try {
        await writeFileRemote(sftp, p.path, data)
        return {
          command: `sftp write ${p.path}`,
          plain: `cat > ${q(p.path)}  # ${data.length} bytes`,
          transport: 'sftp' as const,
          stdout: `${data.length} bytes written`
        }
      } catch (err) {
        if (!isPermissionError(err)) throw err
        const viaShell = await writeViaShell(p.path, p.content ?? '', ctx)
        return {
          command: viaShell.command,
          plain: `sudo tee ${q(p.path)} > /dev/null`,
          transport: 'shell' as const,
          stdout: `${data.length} bytes written (SFTP was denied, written with sudo)`
        }
      }
    }
  },
  {
    id: 'files.mkdir',
    label: (p: { path: string }) => `Create folder ${p.path}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { path: string }) => `mkdir -p ${q(p.path)}`
  },
  {
    id: 'files.touch',
    label: (p: { path: string }) => `Create file ${p.path}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { path: string }) => `touch ${q(p.path)}`
  },
  {
    id: 'files.remove',
    label: (p: { paths: string[] }) =>
      p.paths.length === 1 ? `Delete ${p.paths[0]}` : `Delete ${p.paths.length} items`,
    category: 'Files',
    risk: 'destructive',
    privileged: true,
    description: 'Removed recursively. There is no recycle bin on a server.',
    build: (p: { paths: string[] }) => `rm -rf -- ${p.paths.map(q).join(' ')}`
  },
  {
    id: 'files.rename',
    label: (p: { from: string; to: string }) => `Rename to ${p.to.split('/').pop()}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { from: string; to: string }) => `mv -- ${q(p.from)} ${q(p.to)}`
  },
  {
    id: 'files.copy',
    label: (p: { from: string[]; to: string }) => `Copy ${p.from.length} item(s) to ${p.to}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { from: string[]; to: string }) =>
      `cp -a -- ${p.from.map(q).join(' ')} ${q(p.to)}`
  },
  {
    id: 'files.move',
    label: (p: { from: string[]; to: string }) => `Move ${p.from.length} item(s) to ${p.to}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { from: string[]; to: string }) =>
      `mv -- ${p.from.map(q).join(' ')} ${q(p.to)}`
  },
  {
    id: 'files.chmod',
    label: (p: { paths: string[]; mode: string }) => `Set permissions to ${p.mode}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { paths: string[]; mode: string; recursive?: boolean }) =>
      `chmod ${p.recursive ? '-R ' : ''}${q(p.mode)} -- ${p.paths.map(q).join(' ')}`
  },
  {
    id: 'files.chown',
    label: (p: { paths: string[]; owner: string }) => `Change owner to ${p.owner}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    build: (p: { paths: string[]; owner: string; recursive?: boolean }) =>
      `chown ${p.recursive ? '-R ' : ''}${q(p.owner)} -- ${p.paths.map(q).join(' ')}`
  },
  {
    id: 'files.size',
    label: (p: { path: string }) => `Measure ${p.path}`,
    category: 'Files',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 120_000,
    build: (p: { path: string }) => `du -sb ${q(p.path)} 2>/dev/null || du -sk ${q(p.path)}`,
    parse: (out) => {
      const parts = out.stdout.trim().split(/\s+/)
      return Number(parts[0]) || 0
    }
  },
  {
    id: 'files.largest',
    label: (p: { path: string }) => `Find the biggest files under ${p.path}`,
    category: 'Files',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 180_000,
    description: 'Walks the tree and ranks the 40 largest files.',
    build: (p: { path: string }) =>
      `find ${q(p.path)} -xdev -type f -printf '%s\\t%p\\n' 2>/dev/null | sort -rn | head -n 40`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((line) => {
          const [size, ...rest] = line.split('\t')
          return { sizeBytes: Number(size) || 0, path: rest.join('\t') }
        })
        .filter((row) => row.path)
  },
  {
    id: 'files.search',
    label: (p: { path: string; query: string }) => `Search for "${p.query}"`,
    category: 'Files',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 120_000,
    build: (p: { path: string; query: string }) =>
      `find ${q(p.path)} -xdev -iname ${q(`*${p.query}*`)} 2>/dev/null | head -n 300`,
    parse: (out) => out.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
  },
  {
    id: 'files.grep',
    label: (p: { path: string; query: string }) => `Search file contents for "${p.query}"`,
    category: 'Files',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    timeoutMs: 120_000,
    build: (p: { path: string; query: string }) =>
      `grep -rIn --binary-files=without-match -m 5 -- ${q(p.query)} ${q(p.path)} 2>/dev/null | head -n 200`,
    parse: (out) => out.stdout.split('\n').filter(Boolean)
  },
  {
    id: 'files.tail',
    label: (p: { path: string }) => `Tail ${p.path}`,
    category: 'Files',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { path: string; lines?: number }) =>
      `tail -n ${Number(p.lines ?? 300)} ${q(p.path)}`,
    parse: (out) => out.stdout
  },
  {
    id: 'files.archive',
    label: (p: { paths: string[]; archive: string }) => `Create archive ${p.archive}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    timeoutMs: 300_000,
    build: (p: { paths: string[]; archive: string; cwd: string }) =>
      `tar -czf ${q(p.archive)} -C ${q(p.cwd)} -- ${p.paths.map((path) => q(path.split('/').pop() ?? path)).join(' ')}`
  },
  {
    id: 'files.extract',
    label: (p: { archive: string }) => `Extract ${p.archive}`,
    category: 'Files',
    risk: 'write',
    privileged: true,
    timeoutMs: 300_000,
    build: (p: { archive: string; target: string }) => {
      const archive = p.archive.toLowerCase()
      if (archive.endsWith('.zip')) return `unzip -o ${q(p.archive)} -d ${q(p.target)}`
      if (archive.endsWith('.tar.bz2') || archive.endsWith('.tbz2'))
        return `tar -xjf ${q(p.archive)} -C ${q(p.target)}`
      if (archive.endsWith('.tar.xz') || archive.endsWith('.txz'))
        return `tar -xJf ${q(p.archive)} -C ${q(p.target)}`
      if (archive.endsWith('.tar')) return `tar -xf ${q(p.archive)} -C ${q(p.target)}`
      return `tar -xzf ${q(p.archive)} -C ${q(p.target)}`
    }
  },
  {
    id: 'files.download',
    label: (p: { remotePath: string }) => `Download ${p.remotePath.split('/').pop()}`,
    category: 'Files',
    risk: 'read',
    transport: 'sftp',
    timeoutMs: 0,
    preview: (p: { remotePath: string }) => `scp ${p.remotePath} <local>`,
    custom: async (p: { remotePath: string; localPath: string }, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      await fastGet(sftp, p.remotePath, p.localPath)
      return {
        data: p.localPath,
        command: `sftp get ${p.remotePath} -> ${p.localPath}`,
        plain: `scp ${q(p.remotePath)} ${q(p.localPath)}`,
        transport: 'sftp' as const,
        stdout: `Saved to ${p.localPath}`
      }
    }
  },
  {
    id: 'files.upload',
    label: (p: { localPath: string }) => `Upload ${p.localPath.split(/[\\/]/).pop()}`,
    category: 'Files',
    risk: 'write',
    transport: 'sftp',
    timeoutMs: 0,
    preview: (p: { localPath: string; remoteDir: string }) =>
      `scp <local>/${p.localPath.split(/[\\/]/).pop()} ${p.remoteDir}/`,
    custom: async (p: { localPath: string; remoteDir: string }, ctx: ActionContext) => {
      const sftp = await ctx.conn.sftp()
      const name = p.localPath.split(/[\\/]/).pop() ?? 'upload'
      const remote = joinRemote(p.remoteDir, name)
      await fastPut(sftp, p.localPath, remote)
      return {
        data: remote,
        command: `sftp put ${p.localPath} -> ${remote}`,
        plain: `scp ${q(p.localPath)} ${q(remote)}`,
        transport: 'sftp' as const,
        stdout: `Uploaded to ${remote}`
      }
    }
  }
])
