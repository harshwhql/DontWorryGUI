import type { FirewallState, ListeningPort, NetInterface, RouteEntry } from '@shared/types'
import { defineActions, type ActionContext } from './types'
import { q } from './system'

function parseIpJsonAddr(stdout: string): NetInterface[] {
  const parsed = JSON.parse(stdout) as Array<{
    ifname: string
    operstate?: string
    address?: string
    mtu?: number
    addr_info?: Array<{ family: string; local: string; prefixlen: number }>
  }>
  return parsed.map((item) => ({
    name: item.ifname,
    state: (item.operstate ?? 'UNKNOWN').toLowerCase(),
    mac: item.address,
    mtu: item.mtu,
    addresses: (item.addr_info ?? [])
      .filter((a) => a.family === 'inet' || a.family === 'inet6')
      .map((a) => ({ family: a.family as 'inet' | 'inet6', address: a.local, prefix: a.prefixlen }))
  }))
}

function parseIpTextAddr(stdout: string): NetInterface[] {
  const interfaces: NetInterface[] = []
  let current: NetInterface | null = null
  for (const raw of stdout.split('\n')) {
    const header = raw.match(/^\d+:\s+([^:@]+)[:@].*?mtu\s+(\d+)/)
    if (header) {
      const stateMatch = raw.match(/state\s+(\S+)/)
      current = {
        name: header[1].trim(),
        state: (stateMatch?.[1] ?? 'unknown').toLowerCase(),
        mtu: Number(header[2]),
        addresses: []
      }
      interfaces.push(current)
      continue
    }
    if (!current) continue
    const mac = raw.match(/link\/\w+\s+([0-9a-f:]{17})/i)
    if (mac) current.mac = mac[1]
    const inet = raw.match(/\s(inet6?)\s+([^/\s]+)\/(\d+)/)
    if (inet) {
      current.addresses.push({
        family: inet[1] as 'inet' | 'inet6',
        address: inet[2],
        prefix: Number(inet[3])
      })
    }
  }
  return interfaces
}

function parsePorts(stdout: string): ListeningPort[] {
  const rows: ListeningPort[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trim()
    if (!line || /^(Netid|Proto|Active)/i.test(line)) continue
    const parts = line.split(/\s+/)

    // ss -tulpnH  →  netid state recvq sendq local peer [users:(...)]
    if (/^(tcp|udp|tcp6|udp6)$/i.test(parts[0]) && parts.length >= 5) {
      const isSs = /^(LISTEN|UNCONN|ESTAB)$/i.test(parts[1])
      const local = isSs ? parts[4] : parts[3]
      const state = isSs ? parts[1] : (parts.at(-1) ?? '')
      const portMatch = local?.match(/:(\d+)$/)
      const proc = line.match(/users:\(\("([^"]+)",pid=(\d+)/) ?? line.match(/(\d+)\/(\S+)\s*$/)
      rows.push({
        protocol: parts[0].toLowerCase(),
        localAddress: local?.replace(/:(\d+)$/, '') || '*',
        port: Number(portMatch?.[1] ?? 0),
        state: state || 'LISTEN',
        process: proc ? (proc[1].match(/^\d+$/) ? proc[2] : proc[1]) : undefined,
        pid: proc ? Number(proc[1].match(/^\d+$/) ? proc[1] : proc[2]) || undefined : undefined
      })
    }
  }
  return rows
    .filter((r) => r.port > 0)
    .sort((a, b) => a.port - b.port)
}

function parseUfw(stdout: string): FirewallState {
  const active = /Status:\s*active/i.test(stdout)
  const defaults = stdout.match(/Default:\s*(\S+)\s*\(incoming\),\s*(\S+)\s*\(outgoing\)/i)
  const rules = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\b(ALLOW|DENY|REJECT|LIMIT)\b/.test(l) && !/^Default:/i.test(l))
    .map((raw) => {
      const match = raw.match(/^(\S+(?:\s\(\w+\))?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(\S+)\s*(.*)$/i)
      return {
        raw,
        to: match?.[1],
        action: match?.[2]?.toUpperCase(),
        from: match?.[3],
        port: match?.[1]?.match(/^(\d+(?:[:/]\w+)?)/)?.[1]
      }
    })
  return {
    backend: 'ufw',
    active,
    defaultIncoming: defaults?.[1],
    defaultOutgoing: defaults?.[2],
    rules
  }
}

function parseFirewalld(stdout: string): FirewallState {
  const rules: FirewallState['rules'] = []
  const services = stdout.match(/services:\s*(.*)/)?.[1]?.trim()
  const ports = stdout.match(/\bports:\s*(.*)/)?.[1]?.trim()
  if (services) {
    for (const svc of services.split(/\s+/).filter(Boolean)) {
      rules.push({ raw: `service ${svc}`, action: 'ALLOW', to: svc })
    }
  }
  if (ports) {
    for (const port of ports.split(/\s+/).filter(Boolean)) {
      rules.push({ raw: `port ${port}`, action: 'ALLOW', port })
    }
  }
  return {
    backend: 'firewalld',
    active: /running|\btarget:/i.test(stdout) || rules.length > 0,
    defaultIncoming: stdout.match(/target:\s*(\S+)/)?.[1],
    rules
  }
}

export const networkActions = defineActions([
  {
    id: 'network.interfaces',
    label: 'List network interfaces',
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    build: () => `ip -j addr show 2>/dev/null || ip addr show 2>/dev/null || ifconfig -a`,
    parse: (out): NetInterface[] => {
      const text = out.stdout.trim()
      if (text.startsWith('[')) {
        try {
          return parseIpJsonAddr(text)
        } catch {
          /* fall through */
        }
      }
      return parseIpTextAddr(text)
    }
  },
  {
    id: 'network.ports',
    label: 'List listening ports',
    category: 'Network',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    description: 'Needs root to attach process names to sockets.',
    build: () => `ss -tulpnH 2>/dev/null || ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null`,
    parse: (out) => parsePorts(out.stdout)
  },
  {
    id: 'network.connections',
    label: 'List established connections',
    category: 'Network',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: () => `ss -tnpH state established 2>/dev/null | head -n 200 || netstat -tnp 2>/dev/null | head -n 200`,
    parse: (out) =>
      out.stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((raw) => {
          const parts = raw.split(/\s+/)
          const proc = raw.match(/users:\(\("([^"]+)",pid=(\d+)/)
          return {
            raw,
            local: parts[2] ?? '',
            peer: parts[3] ?? '',
            process: proc?.[1],
            pid: proc ? Number(proc[2]) : undefined
          }
        })
  },
  {
    id: 'network.routes',
    label: 'Show the routing table',
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    build: () => `ip -j route show 2>/dev/null || ip route show 2>/dev/null || route -n`,
    parse: (out): RouteEntry[] => {
      const text = out.stdout.trim()
      if (text.startsWith('[')) {
        try {
          const parsed = JSON.parse(text) as Array<{
            dst?: string
            gateway?: string
            dev?: string
            protocol?: string
            metric?: number
          }>
          return parsed.map((r) => ({
            destination: r.dst ?? 'default',
            gateway: r.gateway,
            dev: r.dev,
            protocol: r.protocol,
            metric: r.metric
          }))
        } catch {
          /* fall through */
        }
      }
      return text
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.trim().split(/\s+/)
          const get = (key: string): string | undefined => {
            const i = parts.indexOf(key)
            return i >= 0 ? parts[i + 1] : undefined
          }
          return {
            destination: parts[0],
            gateway: get('via'),
            dev: get('dev'),
            protocol: get('proto'),
            metric: Number(get('metric')) || undefined
          }
        })
    }
  },
  {
    id: 'network.dns',
    label: 'Show DNS configuration',
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    build: () =>
      `resolvectl status 2>/dev/null | head -n 30 || cat /etc/resolv.conf 2>/dev/null`,
    parse: (out) => out.stdout
  },
  {
    id: 'network.ping',
    label: (p: { target: string }) => `Ping ${p.target}`,
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    timeoutMs: 30_000,
    build: (p: { target: string; count?: number }) =>
      `ping -c ${Number(p.count ?? 4)} -W 2 ${q(p.target)}`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'network.traceroute',
    label: (p: { target: string }) => `Trace the route to ${p.target}`,
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    timeoutMs: 90_000,
    build: (p: { target: string }) =>
      `traceroute -n -w 2 -q 1 ${q(p.target)} 2>/dev/null || tracepath -n ${q(p.target)}`,
    parse: (out) => out.stdout || out.stderr
  },
  {
    id: 'network.speedCheck',
    label: 'Measure download throughput',
    category: 'Network',
    risk: 'read',
    allowFailure: true,
    timeoutMs: 90_000,
    description: 'Pulls 25 MB from Cloudflare and reports the rate.',
    build: () =>
      `curl -s -o /dev/null -w 'bytes=%{size_download} seconds=%{time_total} speed=%{speed_download}\\n' --max-time 60 https://speed.cloudflare.com/__down?bytes=25000000`,
    parse: (out) => out.stdout.trim()
  },

  /* ---------------- firewall ---------------- */
  {
    id: 'firewall.status',
    label: 'Read firewall rules',
    category: 'Firewall',
    risk: 'read',
    privileged: true,
    allowFailure: true,
    build: (_p, ctx: ActionContext) => {
      switch (ctx.facts.firewall) {
        case 'ufw':
          return `ufw status verbose`
        case 'firewalld':
          return `firewall-cmd --list-all`
        case 'iptables':
          return `iptables -L -n -v --line-numbers`
        default:
          return `echo 'no firewall tool found'`
      }
    },
    parse: (out, _p, ctx): FirewallState => {
      switch (ctx.facts.firewall) {
        case 'ufw':
          return parseUfw(out.stdout)
        case 'firewalld':
          return parseFirewalld(out.stdout)
        case 'iptables':
          return {
            backend: 'iptables',
            active: true,
            rules: out.stdout
              .split('\n')
              .filter((l) => /^\s*\d+\s/.test(l))
              .map((raw) => ({ raw: raw.trim() }))
          }
        default:
          return { backend: 'none', active: false, rules: [] }
      }
    }
  },
  {
    id: 'firewall.allow',
    label: (p: { port: string }) => `Allow traffic on ${p.port}`,
    category: 'Firewall',
    risk: 'write',
    privileged: true,
    build: (p: { port: string; protocol?: string; from?: string }, ctx: ActionContext) => {
      const proto = p.protocol && p.protocol !== 'any' ? `/${p.protocol}` : ''
      switch (ctx.facts.firewall) {
        case 'ufw':
          return p.from
            ? `ufw allow from ${q(p.from)} to any port ${q(p.port)}${proto ? ` proto ${q(p.protocol!)}` : ''}`
            : `ufw allow ${q(p.port + proto)}`
        case 'firewalld':
          return `firewall-cmd --permanent --add-port=${q(`${p.port}/${p.protocol || 'tcp'}`)} && firewall-cmd --reload`
        case 'iptables':
          return `iptables -A INPUT -p ${q(p.protocol || 'tcp')} --dport ${q(p.port)} -j ACCEPT`
        default:
          return `echo 'no firewall tool found'`
      }
    }
  },
  {
    id: 'firewall.deny',
    label: (p: { port: string }) => `Block traffic on ${p.port}`,
    category: 'Firewall',
    risk: 'write',
    privileged: true,
    build: (p: { port: string; protocol?: string }, ctx: ActionContext) => {
      switch (ctx.facts.firewall) {
        case 'ufw':
          return `ufw deny ${q(p.port + (p.protocol && p.protocol !== 'any' ? `/${p.protocol}` : ''))}`
        case 'firewalld':
          return `firewall-cmd --permanent --remove-port=${q(`${p.port}/${p.protocol || 'tcp'}`)} && firewall-cmd --reload`
        case 'iptables':
          return `iptables -A INPUT -p ${q(p.protocol || 'tcp')} --dport ${q(p.port)} -j DROP`
        default:
          return `echo 'no firewall tool found'`
      }
    }
  },
  {
    id: 'firewall.deleteRule',
    label: (p: { rule: string }) => `Delete rule "${p.rule}"`,
    category: 'Firewall',
    risk: 'destructive',
    privileged: true,
    build: (p: { rule: string }, ctx: ActionContext) => {
      switch (ctx.facts.firewall) {
        case 'ufw':
          return `ufw --force delete ${q(p.rule)}`
        case 'firewalld':
          return `firewall-cmd --permanent --remove-port=${q(p.rule)} && firewall-cmd --reload`
        default:
          return `echo 'deleting rules is not supported for this backend'`
      }
    }
  },
  {
    id: 'firewall.enable',
    label: 'Turn the firewall on',
    category: 'Firewall',
    risk: 'destructive',
    privileged: true,
    description: 'If SSH is not allowed first, this can lock you out of the server.',
    build: (_p, ctx: ActionContext) =>
      ctx.facts.firewall === 'ufw'
        ? `ufw --force enable`
        : `systemctl enable --now firewalld`
  },
  {
    id: 'firewall.disable',
    label: 'Turn the firewall off',
    category: 'Firewall',
    risk: 'destructive',
    privileged: true,
    description: 'Every port becomes reachable from the network.',
    build: (_p, ctx: ActionContext) =>
      ctx.facts.firewall === 'ufw' ? `ufw --force disable` : `systemctl disable --now firewalld`
  }
])
