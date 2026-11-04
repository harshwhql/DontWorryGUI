import type { ActionDescriptor } from '@shared/types'
import type { ActionDef } from './types'
import { systemActions } from './system'
import { processActions } from './processes'
import { serviceActions } from './services'
import { fileActions } from './files'
import { packageActions } from './packages'
import { networkActions } from './network'
import { userActions } from './users'
import { dockerActions } from './docker'
import { logActions } from './logs'
import { cronActions } from './cron'

const ALL: ActionDef[] = [
  ...systemActions,
  ...processActions,
  ...serviceActions,
  ...fileActions,
  ...packageActions,
  ...networkActions,
  ...userActions,
  ...dockerActions,
  ...logActions,
  ...cronActions
]

class Registry {
  private map = new Map<string, ActionDef>()

  constructor(defs: ActionDef[]) {
    for (const def of defs) {
      if (this.map.has(def.id)) {
        throw new Error(`Duplicate action id "${def.id}" in the registry.`)
      }
      this.map.set(def.id, def)
    }
  }

  get(id: string): ActionDef | undefined {
    return this.map.get(id)
  }

  /** everything the renderer needs to render the command palette */
  describe(): ActionDescriptor[] {
    return [...this.map.values()].map((def) => ({
      id: def.id,
      label: staticLabel(def),
      category: def.category,
      risk: def.risk,
      privileged: Boolean(def.privileged),
      description: def.description
    }))
  }

  get size(): number {
    return this.map.size
  }
}

/**
 * Dynamic labels are built from parameters we do not have yet, so fall back to
 * a readable version of the action id when calling the formatter would throw.
 */
function staticLabel(def: ActionDef): string {
  if (typeof def.label === 'string') return def.label
  try {
    const built = def.label({})
    if (built && !built.includes('undefined')) return built
  } catch {
    /* parameters required, so fall back to the id */
  }
  const [group, ...rest] = def.id.split('.')
  const verb = rest.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2')
  return `${verb.charAt(0).toUpperCase()}${verb.slice(1)} · ${group}`
}

export const registry = new Registry(ALL)
