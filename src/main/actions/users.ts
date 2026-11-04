import type { GroupEntry, UserEntry } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { q } from './system'

const LIST_COMMAND = [
  `echo '@@PASSWD'; getent passwd`,
  `echo '@@GROUP'; getent group`,
  `echo '@@SHADOW'; passwd -S -a 2>/dev/null || true`,
  `echo '@@SHELLS'; cat /etc/shells 2>/dev/null || true`
].join('; ')

function section(stdout: string, name: string): string[] {
  const parts = stdout.split(new RegExp(`^@@${name}\\s*$`, 'm'))
  if (parts.length < 2) return []
  return parts[1].split(/^@@[A-Z]+\s*$/m)[0].split('\n').filter(Boolean)
}

export interface UsersPayload {
  users: UserEntry[]
  groups: GroupEntry[]
  shells: string[]
}

export const userActions = defineActions([
  {
    id: 'users.list',
    label: 'List users and groups',
    category: 'Users',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    description: 'Reads /etc/passwd and /etc/group; lock status needs root.',
    build: () => LIST_COMMAND,
    parse: (out): UsersPayload => {
      const groups: GroupEntry[] = section(out.stdout, 'GROUP')
        .map((line) => {
          const [name, , gid, members] = line.split(':')
          return {
            name,
            gid: Number(gid) || 0,
            members: (members ?? '').split(',').filter(Boolean)
          }
        })
        .filter((g) => g.name)

      const lockState = new Map<string, string>()
      for (const line of section(out.stdout, 'SHADOW')) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 2) lockState.set(parts[0], parts[1])
      }

      const groupByGid = new Map(groups.map((g) => [g.gid, g.name]))

      const users: UserEntry[] = section(out.stdout, 'PASSWD')
        .map((line) => {
          const [name, , uid, gid, comment, home, shell] = line.split(':')
          const uidNum = Number(uid) || 0
          const gidNum = Number(gid) || 0
          const primary = groupByGid.get(gidNum)
          const secondary = groups.filter((g) => g.members.includes(name)).map((g) => g.name)
          const status = lockState.get(name)
          return {
            name,
            uid: uidNum,
            gid: gidNum,
            comment: comment ?? '',
            home: home ?? '',
            shell: shell ?? '',
            groups: [...new Set([primary, ...secondary].filter(Boolean) as string[])],
            isSystem: uidNum < 1000 && uidNum !== 0,
            locked: status ? status === 'L' || status === 'LK' : undefined
          }
        })
        .filter((u) => u.name)
        .sort((a, b) => Number(a.isSystem) - Number(b.isSystem) || a.name.localeCompare(b.name))

      const shells = section(out.stdout, 'SHELLS')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('/'))

      return { users, groups, shells }
    }
  },
  {
    id: 'users.create',
    label: (p: { name: string }) => `Create user ${p.name}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: {
      name: string
      shell?: string
      comment?: string
      groups?: string[]
      createHome?: boolean
      system?: boolean
    }) => {
      const flags = [
        p.createHome === false ? '-M' : '-m',
        p.system ? '-r' : '',
        p.shell ? `-s ${q(p.shell)}` : '',
        p.comment ? `-c ${q(p.comment)}` : '',
        p.groups?.length ? `-G ${q(p.groups.join(','))}` : ''
      ].filter(Boolean)
      return `useradd ${flags.join(' ')} ${q(p.name)}`
    }
  },
  {
    id: 'users.delete',
    label: (p: { name: string }) => `Delete user ${p.name}`,
    category: 'Users',
    risk: 'destructive',
    privileged: true,
    description: 'Optionally removes the home directory and mail spool for good.',
    build: (p: { name: string; removeHome?: boolean }) =>
      `userdel ${p.removeHome ? '-r ' : ''}${q(p.name)}`
  },
  {
    id: 'users.setPassword',
    label: (p: { name: string }) => `Set a new password for ${p.name}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    description: 'The password is piped over the encrypted channel, never written into a command.',
    preview: () => `chpasswd   # username:password supplied on stdin`,
    custom: async (p: { name: string; password: string }, ctx: ActionContext) => {
      const out = await ctx.exec('chpasswd', {
        privileged: true,
        stdin: `${p.name}:${p.password}\n`
      })
      if (out.code !== 0) throw new Error(out.stderr.trim() || `chpasswd exited with ${out.code}`)
      return {
        command: `chpasswd   # ${p.name}:•••••••• supplied on stdin`,
        plain: `passwd ${q(p.name)}`,
        stdout: 'Password updated.',
        exitCode: 0
      }
    }
  },
  {
    id: 'users.lock',
    label: (p: { name: string }) => `Lock ${p.name} out`,
    category: 'Users',
    risk: 'destructive',
    privileged: true,
    build: (p: { name: string }) => `usermod -L ${q(p.name)}`
  },
  {
    id: 'users.unlock',
    label: (p: { name: string }) => `Unlock ${p.name}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: { name: string }) => `usermod -U ${q(p.name)}`
  },
  {
    id: 'users.setShell',
    label: (p: { name: string; shell: string }) => `Set ${p.name}'s shell to ${p.shell}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: { name: string; shell: string }) => `usermod -s ${q(p.shell)} ${q(p.name)}`
  },
  {
    id: 'users.addToGroup',
    label: (p: { name: string; group: string }) => `Add ${p.name} to ${p.group}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: { name: string; group: string }) => `usermod -aG ${q(p.group)} ${q(p.name)}`
  },
  {
    id: 'users.removeFromGroup',
    label: (p: { name: string; group: string }) => `Remove ${p.name} from ${p.group}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: { name: string; group: string }) => `gpasswd -d ${q(p.name)} ${q(p.group)}`
  },
  {
    id: 'groups.create',
    label: (p: { name: string }) => `Create group ${p.name}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    build: (p: { name: string }) => `groupadd ${q(p.name)}`
  },
  {
    id: 'groups.delete',
    label: (p: { name: string }) => `Delete group ${p.name}`,
    category: 'Users',
    risk: 'destructive',
    privileged: true,
    build: (p: { name: string }) => `groupdel ${q(p.name)}`
  },
  {
    id: 'users.keys.list',
    label: (p: { name: string }) => `List ${p.name}'s SSH keys`,
    category: 'Users',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (p: { name: string }) =>
      `cat "$(getent passwd ${q(p.name)} | cut -d: -f6)/.ssh/authorized_keys" 2>/dev/null || true`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((raw) => {
          const parts = raw.split(/\s+/)
          return { type: parts[0], fingerprintSource: parts[1]?.slice(-16), comment: parts.slice(2).join(' '), raw }
        })
  },
  {
    id: 'users.keys.add',
    label: (p: { name: string }) => `Authorise a new SSH key for ${p.name}`,
    category: 'Users',
    risk: 'write',
    privileged: true,
    description: 'Appends to ~/.ssh/authorized_keys and fixes the permissions.',
    build: (p: { name: string; key: string }) =>
      [
        `home="$(getent passwd ${q(p.name)} | cut -d: -f6)"`,
        `mkdir -p "$home/.ssh"`,
        `printf '%s\\n' ${q(p.key.trim())} >> "$home/.ssh/authorized_keys"`,
        `chmod 700 "$home/.ssh"`,
        `chmod 600 "$home/.ssh/authorized_keys"`,
        `chown -R ${q(p.name)} "$home/.ssh"`
      ].join(' && ')
  },
  {
    id: 'users.keys.remove',
    label: (p: { name: string }) => `Revoke an SSH key from ${p.name}`,
    category: 'Users',
    risk: 'destructive',
    privileged: true,
    build: (p: { name: string; key: string }) =>
      [
        `home="$(getent passwd ${q(p.name)} | cut -d: -f6)"`,
        `grep -vxF ${q(p.key.trim())} "$home/.ssh/authorized_keys" > "$home/.ssh/authorized_keys.tmp"`,
        `mv "$home/.ssh/authorized_keys.tmp" "$home/.ssh/authorized_keys"`,
        `chown ${q(p.name)} "$home/.ssh/authorized_keys"`
      ].join(' && ')
  }
])
