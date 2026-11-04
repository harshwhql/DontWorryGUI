import type { PackageEntry, PackageManager } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { q } from './system'

/**
 * One GUI, five package managers. Each entry returns the native command so the
 * inspector always shows what the distro actually runs.
 */
interface PmRecipe {
  installed: string
  upgradable: string
  refresh: string
  upgradeAll: string
  install: (names: string[]) => string
  remove: (names: string[]) => string
  purge: (names: string[]) => string
  search: (query: string) => string
  info: (name: string) => string
  autoremove: string
  parseInstalled: (stdout: string) => PackageEntry[]
  parseUpgradable: (stdout: string) => PackageEntry[]
  parseSearch: (stdout: string) => PackageEntry[]
}

const tabbed = (stdout: string): PackageEntry[] =>
  stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, version, architecture, ...rest] = line.split('\t')
      return { name, version, architecture, description: rest.join(' ').trim() }
    })
    .filter((p) => p.name)

const APT: PmRecipe = {
  installed: `dpkg-query -W -f='\${Package}\\t\${Version}\\t\${Architecture}\\t\${binary:Summary}\\n' 2>/dev/null`,
  upgradable: `apt list --upgradable 2>/dev/null | tail -n +2`,
  refresh: `apt-get update`,
  upgradeAll: `DEBIAN_FRONTEND=noninteractive apt-get -y upgrade`,
  install: (names) => `DEBIAN_FRONTEND=noninteractive apt-get install -y ${names.map(q).join(' ')}`,
  remove: (names) => `DEBIAN_FRONTEND=noninteractive apt-get remove -y ${names.map(q).join(' ')}`,
  purge: (names) => `DEBIAN_FRONTEND=noninteractive apt-get purge -y ${names.map(q).join(' ')}`,
  search: (query) => `apt-cache search ${q(query)} | head -n 150`,
  info: (name) => `apt-cache show ${q(name)} | head -n 40`,
  autoremove: `DEBIAN_FRONTEND=noninteractive apt-get autoremove -y`,
  parseInstalled: tabbed,
  parseUpgradable: (stdout) =>
    stdout
      .split('\n')
      .filter((l) => l.includes('/'))
      .map((line) => {
        const [pkgPart, newVersion, arch] = line.split(/\s+/)
        const from = line.match(/upgradable from:\s*([^\]]+)/)
        return {
          name: pkgPart.split('/')[0],
          version: from?.[1]?.trim() ?? '',
          availableVersion: newVersion,
          architecture: arch
        }
      })
      .filter((p) => p.name),
  parseSearch: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(' - ')
        return idx > 0
          ? { name: line.slice(0, idx).trim(), version: '', description: line.slice(idx + 3).trim() }
          : { name: line.trim(), version: '' }
      })
      .filter((p) => p.name)
}

const RPM_INSTALLED = `rpm -qa --qf '%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{ARCH}\\t%{SUMMARY}\\n' 2>/dev/null | sort`

function dnfLike(bin: 'dnf' | 'yum'): PmRecipe {
  return {
    installed: RPM_INSTALLED,
    upgradable: `${bin} -q check-update 2>/dev/null | awk 'NF==3 && $1 !~ /^(Last|Obsoleting)/ {print $1"\\t"$2"\\t"$3}'`,
    refresh: `${bin} -y makecache`,
    upgradeAll: `${bin} -y upgrade`,
    install: (names) => `${bin} -y install ${names.map(q).join(' ')}`,
    remove: (names) => `${bin} -y remove ${names.map(q).join(' ')}`,
    purge: (names) => `${bin} -y remove ${names.map(q).join(' ')}`,
    search: (query) => `${bin} -q search ${q(query)} 2>/dev/null | head -n 150`,
    info: (name) => `${bin} -q info ${q(name)} 2>/dev/null | head -n 40`,
    autoremove: `${bin} -y autoremove`,
    parseInstalled: tabbed,
    parseUpgradable: (stdout) =>
      stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [nameArch, version] = line.split('\t')
          const dot = nameArch.lastIndexOf('.')
          return {
            name: dot > 0 ? nameArch.slice(0, dot) : nameArch,
            architecture: dot > 0 ? nameArch.slice(dot + 1) : undefined,
            version: '',
            availableVersion: version
          }
        })
        .filter((p) => p.name),
    parseSearch: (stdout) =>
      stdout
        .split('\n')
        .filter((l) => l.includes(':'))
        .map((line) => {
          const idx = line.indexOf(':')
          return {
            name: line.slice(0, idx).trim().split('.')[0],
            version: '',
            description: line.slice(idx + 1).trim()
          }
        })
        .filter((p) => p.name && !p.name.includes(' '))
  }
}

const PACMAN: PmRecipe = {
  installed: `pacman -Q 2>/dev/null | awk '{print $1"\\t"$2}'`,
  upgradable: `checkupdates 2>/dev/null || pacman -Qu 2>/dev/null`,
  refresh: `pacman -Sy --noconfirm`,
  upgradeAll: `pacman -Syu --noconfirm`,
  install: (names) => `pacman -S --noconfirm ${names.map(q).join(' ')}`,
  remove: (names) => `pacman -R --noconfirm ${names.map(q).join(' ')}`,
  purge: (names) => `pacman -Rns --noconfirm ${names.map(q).join(' ')}`,
  search: (query) => `pacman -Ss ${q(query)} 2>/dev/null | head -n 150`,
  info: (name) => `pacman -Qi ${q(name)} 2>/dev/null || pacman -Si ${q(name)}`,
  autoremove: `pacman -Rns --noconfirm $(pacman -Qtdq 2>/dev/null) 2>/dev/null || echo 'nothing to remove'`,
  parseInstalled: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, version] = line.split('\t')
        return { name, version: version ?? '' }
      })
      .filter((p) => p.name),
  parseUpgradable: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/)
        return { name: parts[0], version: parts[1] ?? '', availableVersion: parts[3] ?? parts[2] ?? '' }
      })
      .filter((p) => p.name),
  parseSearch: (stdout) => {
    const rows: PackageEntry[] = []
    const lines = stdout.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const head = lines[i].match(/^(\S+)\/(\S+)\s+(\S+)/)
      if (head) {
        rows.push({ name: head[2], version: head[3], description: (lines[i + 1] ?? '').trim() })
      }
    }
    return rows
  }
}

const ZYPPER: PmRecipe = {
  installed: RPM_INSTALLED,
  upgradable: `zypper --quiet list-updates 2>/dev/null | awk -F'|' 'NR>2 {gsub(/ /,"",$3); print $3"\\t"$4"\\t"$5}'`,
  refresh: `zypper --non-interactive refresh`,
  upgradeAll: `zypper --non-interactive update`,
  install: (names) => `zypper --non-interactive install ${names.map(q).join(' ')}`,
  remove: (names) => `zypper --non-interactive remove ${names.map(q).join(' ')}`,
  purge: (names) => `zypper --non-interactive remove --clean-deps ${names.map(q).join(' ')}`,
  search: (query) => `zypper --quiet search ${q(query)} 2>/dev/null | head -n 150`,
  info: (name) => `zypper --quiet info ${q(name)} 2>/dev/null | head -n 40`,
  autoremove: `zypper --non-interactive remove --clean-deps $(zypper --quiet packages --unneeded 2>/dev/null | awk -F'|' 'NR>2{print $3}') 2>/dev/null || true`,
  parseInstalled: tabbed,
  parseUpgradable: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, version, available] = line.split('\t')
        return { name: name?.trim() ?? '', version: version?.trim() ?? '', availableVersion: available?.trim() }
      })
      .filter((p) => p.name),
  parseSearch: (stdout) =>
    stdout
      .split('\n')
      .filter((l) => l.includes('|'))
      .map((line) => {
        const cols = line.split('|').map((c) => c.trim())
        return { name: cols[1] ?? '', version: '', description: cols[2] ?? '' }
      })
      .filter((p) => p.name && p.name !== 'Name')
}

const APK: PmRecipe = {
  installed: `apk info -v 2>/dev/null | sort`,
  upgradable: `apk version -l '<' 2>/dev/null | tail -n +2`,
  refresh: `apk update`,
  upgradeAll: `apk upgrade`,
  install: (names) => `apk add ${names.map(q).join(' ')}`,
  remove: (names) => `apk del ${names.map(q).join(' ')}`,
  purge: (names) => `apk del --purge ${names.map(q).join(' ')}`,
  search: (query) => `apk search -v ${q(query)} 2>/dev/null | head -n 150`,
  info: (name) => `apk info -a ${q(name)} 2>/dev/null | head -n 40`,
  autoremove: `echo 'apk removes orphans automatically'`,
  parseInstalled: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.lastIndexOf('-')
        const second = line.lastIndexOf('-', idx - 1)
        return second > 0
          ? { name: line.slice(0, second), version: line.slice(second + 1) }
          : { name: line, version: '' }
      })
      .filter((p) => p.name),
  parseUpgradable: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.trim().split(/\s+/)
        return { name: parts[0] ?? '', version: '', availableVersion: parts.at(-1) ?? '' }
      })
      .filter((p) => p.name),
  parseSearch: (stdout) =>
    stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(' - ')
        return idx > 0
          ? { name: line.slice(0, idx).trim(), version: '', description: line.slice(idx + 3).trim() }
          : { name: line.trim(), version: '' }
      })
      .filter((p) => p.name)
}

const RECIPES: Record<Exclude<PackageManager, 'unknown'>, PmRecipe> = {
  apt: APT,
  dnf: dnfLike('dnf'),
  yum: dnfLike('yum'),
  pacman: PACMAN,
  zypper: ZYPPER,
  apk: APK
}

export function recipeFor(ctx: ActionContext): PmRecipe {
  const pm = ctx.facts.packageManager
  if (pm === 'unknown') throw new Error('No supported package manager was found on this server.')
  return RECIPES[pm]
}

export const packageActions = defineActions([
  {
    id: 'packages.installed',
    label: 'List installed packages',
    category: 'Packages',
    risk: 'read',
    timeoutMs: 60_000,
    allowFailure: true,
    build: (_p, ctx) => recipeFor(ctx).installed,
    parse: (out, _p, ctx) => recipeFor(ctx).parseInstalled(out.stdout)
  },
  {
    id: 'packages.upgradable',
    label: 'Check for updates',
    category: 'Packages',
    risk: 'read',
    timeoutMs: 120_000,
    allowFailure: true,
    description: 'Reads the local package index — run a refresh first for fresh results.',
    build: (_p, ctx) => recipeFor(ctx).upgradable,
    parse: (out, _p, ctx) => recipeFor(ctx).parseUpgradable(out.stdout)
  },
  {
    id: 'packages.refresh',
    label: 'Refresh the package index',
    category: 'Packages',
    risk: 'write',
    privileged: true,
    timeoutMs: 300_000,
    build: (_p, ctx) => recipeFor(ctx).refresh,
    parse: (out) => out.stdout
  },
  {
    id: 'packages.upgradeAll',
    label: 'Install every available update',
    category: 'Packages',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 1_800_000,
    description: 'Upgrades all packages. Services may restart and the kernel may change.',
    build: (_p, ctx) => recipeFor(ctx).upgradeAll,
    parse: (out) => out.stdout
  },
  {
    id: 'packages.install',
    label: (p: { names: string[] }) => `Install ${p.names.join(', ')}`,
    category: 'Packages',
    risk: 'write',
    privileged: true,
    timeoutMs: 900_000,
    build: (p: { names: string[] }, ctx) => recipeFor(ctx).install(p.names),
    parse: (out) => out.stdout
  },
  {
    id: 'packages.remove',
    label: (p: { names: string[] }) => `Remove ${p.names.join(', ')}`,
    category: 'Packages',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 900_000,
    description: 'Dependent packages may be removed too.',
    build: (p: { names: string[] }, ctx) => recipeFor(ctx).remove(p.names),
    parse: (out) => out.stdout
  },
  {
    id: 'packages.purge',
    label: (p: { names: string[] }) => `Purge ${p.names.join(', ')} and its config`,
    category: 'Packages',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 900_000,
    build: (p: { names: string[] }, ctx) => recipeFor(ctx).purge(p.names),
    parse: (out) => out.stdout
  },
  {
    id: 'packages.search',
    label: (p: { query: string }) => `Search packages for "${p.query}"`,
    category: 'Packages',
    risk: 'read',
    timeoutMs: 120_000,
    allowFailure: true,
    build: (p: { query: string }, ctx) => recipeFor(ctx).search(p.query),
    parse: (out, _p, ctx) => recipeFor(ctx).parseSearch(out.stdout)
  },
  {
    id: 'packages.info',
    label: (p: { name: string }) => `Package details for ${p.name}`,
    category: 'Packages',
    risk: 'read',
    allowFailure: true,
    build: (p: { name: string }, ctx) => recipeFor(ctx).info(p.name),
    parse: (out) => out.stdout
  },
  {
    id: 'packages.autoremove',
    label: 'Remove orphaned packages',
    category: 'Packages',
    risk: 'destructive',
    privileged: true,
    timeoutMs: 600_000,
    build: (_p, ctx) => recipeFor(ctx).autoremove,
    parse: (out) => out.stdout
  }
])
