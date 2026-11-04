import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CalendarClock,
  Cog,
  Container,
  FolderTree,
  Gauge,
  Network,
  Package,
  ScrollText,
  SquareTerminal,
  Users
} from 'lucide-react'
import type { ServerFacts } from '@shared/types'
import type { ViewId } from '../../state/store'

export interface NavItem {
  id: ViewId
  label: string
  icon: LucideIcon
  /** returns a reason string when the feature is unavailable on this server */
  unavailable?: (facts: ServerFacts | undefined) => string | undefined
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const GROUPS: NavGroup[] = [
  {
    title: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: Gauge },
      { id: 'processes', label: 'Processes', icon: Activity },
      {
        id: 'logs',
        label: 'Logs',
        icon: ScrollText
      }
    ]
  },
  {
    title: 'Manage',
    items: [
      { id: 'files', label: 'Files', icon: FolderTree },
      {
        id: 'services',
        label: 'Services',
        icon: Cog,
        unavailable: (facts) =>
          facts && !facts.hasSystemd ? 'This server does not use systemd.' : undefined
      },
      {
        id: 'packages',
        label: 'Packages',
        icon: Package,
        unavailable: (facts) =>
          facts && facts.packageManager === 'unknown'
            ? 'No apt, dnf, pacman, zypper or apk found.'
            : undefined
      },
      {
        id: 'scheduler',
        label: 'Scheduled jobs',
        icon: CalendarClock
      }
    ]
  },
  {
    title: 'Platform',
    items: [
      { id: 'network', label: 'Network & firewall', icon: Network },
      { id: 'users', label: 'Users & access', icon: Users },
      {
        id: 'docker',
        label: 'Containers',
        icon: Container,
        unavailable: (facts) =>
          facts && !facts.hasDocker ? 'Docker is not installed on this server.' : undefined
      }
    ]
  },
  {
    title: 'Direct',
    items: [{ id: 'terminal', label: 'Terminal', icon: SquareTerminal }]
  }
]


export const NAV_ITEMS = GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title }))
)
