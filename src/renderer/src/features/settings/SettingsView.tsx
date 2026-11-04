import { Code2, Cog, Eye, FlaskConical, Gauge, Lock, Terminal, Unlock } from 'lucide-react'
import { Badge, Button, Field, Panel, PanelHeader, Select, Toggle } from '../../components/ui/primitives'
import { KeyValue } from '../../components/ui/data'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

export function SettingsView(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const patch = useApp((s) => s.patchSettings)
  const appInfo = useApp((s) => s.appInfo)
  const descriptors = useApp((s) => s.descriptors)
  const audit = useApp((s) => s.audit)
  const clearAudit = useApp((s) => s.clearAudit)

  const byCategory = descriptors.reduce<Record<string, number>>((acc, descriptor) => {
    acc[descriptor.category] = (acc[descriptor.category] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader icon={Cog} title="Settings" subtitle="How this app behaves on your machine" />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-3 lg:grid-cols-2">
          {/* safety */}
          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Safety rails"
              icon={FlaskConical}
              subtitle="Decide how much friction sits between a click and a change on the server"
            />
            <div className="flex flex-col gap-1 p-3">
              <Toggle
                checked={settings.dryRun}
                onChange={(value) => void patch({ dryRun: value })}
                label="Dry run: show commands but never execute them"
                hint="Read-only actions still run so the interface stays useful. Anything that writes is blocked and logged as a dry run."
                tone="warn"
              />
              <Toggle
                checked={settings.confirmDestructive}
                onChange={(value) => void patch({ confirmDestructive: value })}
                label="Confirm irreversible actions"
                hint="Deleting files, killing processes, stopping services, wiping volumes, rebooting."
              />
              <Toggle
                checked={settings.confirmWrites}
                onChange={(value) => void patch({ confirmWrites: value })}
                label="Confirm every change, even reversible ones"
                hint="Adds a confirmation step to restarts, installs and permission changes too."
              />
            </div>
          </Panel>

          {/* interface */}
          <Panel>
            <PanelHeader title="Interface" icon={Eye} />
            <div className="flex flex-col gap-3 p-3">
              <Toggle
                checked={settings.showCommandInspector}
                onChange={(value) => void patch({ showCommandInspector: value })}
                label="Show the command log by default"
                hint="The live audit trail at the bottom of the window."
              />
              <Toggle
                checked={settings.reduceMotion}
                onChange={(value) => void patch({ reduceMotion: value })}
                label="Reduce motion"
                hint="Turns off entrance animations and transitions. Your system preference is honoured automatically too."
              />
              <Field label="Terminal text size">
                <Select
                  value={String(settings.terminalFontSize)}
                  onChange={(event) => void patch({ terminalFontSize: Number(event.target.value) })}
                >
                  {[10, 11, 12, 13, 14, 15, 16, 18].map((size) => (
                    <option key={size} value={size}>
                      {size}px
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>

          {/* polling */}
          <Panel>
            <PanelHeader title="Live data" icon={Gauge} />
            <div className="flex flex-col gap-3 p-3">
              <Field
                label="Metrics refresh interval"
                hint="How often the overview samples /proc. Faster feels live but costs a round trip each time."
              >
                <Select
                  value={String(settings.pollIntervalMs)}
                  onChange={(event) => void patch({ pollIntervalMs: Number(event.target.value) })}
                >
                  <option value="1000">Every second</option>
                  <option value="2000">Every 2 seconds</option>
                  <option value="3000">Every 3 seconds</option>
                  <option value="5000">Every 5 seconds</option>
                  <option value="10000">Every 10 seconds</option>
                  <option value="30000">Every 30 seconds</option>
                </Select>
              </Field>
              <div className="rounded-md border border-line bg-void/40 p-2.5">
                <p className="text-[11.5px] leading-relaxed text-ink-faint">
                  Background refreshes are marked as polls in the command log and dimmed, so they
                  never bury the commands you triggered yourself.
                </p>
              </div>
            </div>
          </Panel>

          {/* command coverage */}
          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Command coverage"
              icon={Code2}
              subtitle={`${descriptors.length} shell commands are mapped to buttons in this build`}
              actions={
                <Button size="xs" variant="ghost" onClick={() => void clearAudit()}>
                  Clear the command log ({audit.length})
                </Button>
              }
            />
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-3 md:grid-cols-3">
              {Object.entries(byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, count]) => (
                  <div
                    key={category}
                    className="flex items-baseline justify-between gap-2 border-b border-line/40 py-1"
                  >
                    <span className="text-[11.5px] text-ink-dim">{category}</span>
                    <span className="tabular text-[11px] text-ink-faint">{count}</span>
                  </div>
                ))}
            </div>
          </Panel>

          {/* about */}
          <Panel className="lg:col-span-2">
            <PanelHeader title="About" icon={Terminal} />
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 p-3 md:grid-cols-2">
              <KeyValue
                rows={[
                  { label: 'Credential storage', value: appInfo?.encryptionAvailable ? 'OS keystore' : 'plain text' },
                  { label: 'Platform', value: appInfo?.platform ?? '—', mono: true },
                  { label: 'Electron', value: appInfo?.electron ?? '—', mono: true },
                  { label: 'Node', value: appInfo?.node ?? '—', mono: true }
                ]}
              />
              <div className="flex flex-col gap-2">
                <Badge tone={appInfo?.encryptionAvailable ? 'run' : 'danger'} icon={appInfo?.encryptionAvailable ? Lock : Unlock}>
                  {appInfo?.encryptionAvailable
                    ? 'passwords and keys are sealed by the OS'
                    : 'the OS keystore is unavailable on this machine'}
                </Badge>
                <p className="text-[11.5px] leading-relaxed text-ink-faint">
                  Server credentials live only on this computer, in the app&apos;s own data folder,
                  encrypted with the operating system keystore where one is available. Nothing is
                  sent anywhere except over your own SSH connection.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
