import { useMemo, useState } from 'react'
import {
  ArrowUpCircle,
  Download,
  Package,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import type { PackageEntry } from '@shared/types'
import { cn } from '../../lib/format'
import { useDebounced, useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  IconButton,
  Input,
  Panel,
  PanelHeader,
  Segmented,
  Spinner
} from '../../components/ui/primitives'
import { CodeBlock, DataTable, type Column } from '../../components/ui/data'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'

type Tab = 'updates' | 'installed' | 'search'

export function PackagesView(): React.JSX.Element {
  const run = useApp((s) => s.run)
  const pm = useApp((s) => s.activeConnection()?.facts?.packageManager)

  const [tab, setTab] = useState<Tab>('updates')
  const [filter, setFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<PackageEntry[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [output, setOutput] = useState<string>('')
  const [outputTitle, setOutputTitle] = useState<string>('')
  const debounced = useDebounced(filter, 200)

  const updates = useResource<PackageEntry[]>('packages.upgradable', {})
  const installed = useResource<PackageEntry[]>('packages.installed', {}, {
    enabled: tab === 'installed'
  })

  const rows = useMemo(() => {
    const source =
      tab === 'updates' ? (updates.data ?? []) : tab === 'installed' ? (installed.data ?? []) : (searchResults ?? [])
    const term = debounced.trim().toLowerCase()
    if (!term) return source
    return source.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(term) ||
        (pkg.description ?? '').toLowerCase().includes(term)
    )
  }, [tab, updates.data, installed.data, searchResults, debounced])

  const doSearch = async (): Promise<void> => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const results = await run<PackageEntry[]>('packages.search', { query: searchTerm }, { quiet: true })
      setSearchResults(results ?? [])
    } finally {
      setSearching(false)
    }
  }

  const captureOutput = (title: string) => (data: unknown) => {
    if (typeof data === 'string' && data.trim()) {
      setOutputTitle(title)
      setOutput(data)
    }
  }

  const columns: Column<PackageEntry>[] = [
    {
      key: 'name',
      header: 'Package',
      width: 'minmax(150px,1fr)',
      sort: (row) => row.name,
      render: (row) => <span className="mono text-ink">{row.name}</span>
    },
    {
      key: 'version',
      header: tab === 'updates' ? 'Installed' : 'Version',
      width: 'minmax(110px,170px)',
      sort: (row) => row.version,
      className: 'mono text-[10.5px]',
      render: (row) => row.version || '—'
    },
    ...(tab === 'updates'
      ? [
          {
            key: 'available',
            header: 'Available',
            width: 'minmax(110px,170px)',
            sort: (row: PackageEntry) => row.availableVersion ?? '',
            className: 'mono text-[10.5px] text-run-bright',
            render: (row: PackageEntry) => row.availableVersion ?? '—'
          } satisfies Column<PackageEntry>
        ]
      : []),
    {
      key: 'description',
      header: 'Description',
      width: 'minmax(0,1.6fr)',
      sort: (row) => row.description ?? '',
      render: (row) => <span className="truncate text-ink-faint">{row.description ?? ''}</span>
    },
    {
      key: 'actions',
      header: '',
      width: '124px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <CommandPeek
            actionId={tab === 'installed' ? 'packages.remove' : 'packages.install'}
            params={{ names: [row.name] }}
          />
          {tab === 'installed' ? (
            <IconButton
              icon={Trash2}
              label={`Remove ${row.name}`}
              size="xs"
              variant="danger"
              onClick={(event) => {
                event.stopPropagation()
                void run(
                  'packages.remove',
                  { names: [row.name] },
                  { successMessage: `${row.name} removed` }
                ).then((data) => {
                  captureOutput(`Removing ${row.name}`)(data)
                  void installed.refresh(true)
                })
              }}
            />
          ) : (
            <IconButton
              icon={tab === 'updates' ? ArrowUpCircle : Download}
              label={tab === 'updates' ? `Upgrade ${row.name}` : `Install ${row.name}`}
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                void run(
                  'packages.install',
                  { names: [row.name] },
                  { successMessage: `${row.name} installed` }
                ).then((data) => {
                  captureOutput(`Installing ${row.name}`)(data)
                  void updates.refresh(true)
                })
              }}
            />
          )}
        </span>
      )
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={Package}
        title="Packages"
        subtitle={
          pm
            ? `Managed with ${pm} · ${updates.data?.length ?? 0} updates waiting`
            : 'No package manager detected'
        }
        onRefresh={() => void (tab === 'installed' ? installed.refresh() : updates.refresh())}
        refreshing={updates.loading || installed.loading}
        lastUpdated={tab === 'installed' ? installed.lastUpdated : updates.lastUpdated}
      >
        <ActionButton
          actionId="packages.refresh"
          icon={RefreshCw}
          variant="outline"
          size="sm"
          options={{ successMessage: 'Package index refreshed' }}
          onDone={(data) => {
            captureOutput('Refreshing the package index')(data)
            void updates.refresh(true)
          }}
        >
          Refresh index
        </ActionButton>
        <ActionButton
          actionId="packages.upgradeAll"
          icon={ArrowUpCircle}
          variant="warn"
          size="sm"
          options={{ successMessage: 'Upgrade finished' }}
          onDone={(data) => {
            captureOutput('Upgrading every package')(data)
            void updates.refresh(true)
          }}
        >
          Upgrade all
        </ActionButton>
        <ActionButton
          actionId="packages.autoremove"
          icon={PackageCheck}
          variant="outline"
          size="sm"
          options={{ successMessage: 'Orphaned packages removed' }}
          onDone={captureOutput('Removing orphaned packages')}
        >
          Clean up
        </ActionButton>
      </ViewHeader>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-void/40 px-3 py-1.5">
        <Segmented
          value={tab}
          onChange={(next) => {
            setTab(next)
            setFilter('')
          }}
          options={[
            {
              value: 'updates',
              label: `Updates${updates.data?.length ? ` ${updates.data.length}` : ''}`
            },
            {
              value: 'installed',
              label: `Installed${installed.data?.length ? ` ${installed.data.length}` : ''}`
            },
            { value: 'search', label: 'Find new' }
          ]}
        />

        {tab === 'search' ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="relative max-w-sm flex-1">
              <PackageSearch
                size={12}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
                aria-hidden
              />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && void doSearch()}
                placeholder="Search the repositories: nginx, postgresql, htop…"
                className="pl-7"
                aria-label="Search packages"
              />
            </div>
            <Button variant="primary" size="sm" loading={searching} onClick={() => void doSearch()}>
              Search
            </Button>
            <CommandPeek actionId="packages.search" params={{ query: searchTerm }} size="sm" variant="outline" />
          </div>
        ) : (
          <div className="relative w-56">
            <Search
              size={12}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-ghost"
              aria-hidden
            />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter this list"
              className="pl-7"
              aria-label="Filter packages"
            />
          </div>
        )}

        <div className="flex-1" />
        {tab === 'updates' && (updates.data?.length ?? 0) === 0 && !updates.loading ? (
          <Badge tone="run" icon={PackageCheck}>
            everything up to date
          </Badge>
        ) : null}
      </div>

      {updates.error && tab === 'updates' ? (
        <ErrorNote message={updates.error} onRetry={() => void updates.refresh()} />
      ) : null}
      {installed.error && tab === 'installed' ? (
        <ErrorNote message={installed.error} onRetry={() => void installed.refresh()} />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => `${row.name}-${row.version}`}
          defaultSortKey="name"
          defaultSortDir="asc"
          emptyState={
            <EmptyState
              icon={tab === 'updates' ? PackageCheck : Package}
              title={
                tab === 'search'
                  ? searchResults === null
                    ? 'Search the repositories'
                    : 'Nothing matched'
                  : tab === 'updates'
                    ? updates.initial
                      ? 'Checking for updates'
                      : 'No updates available'
                    : installed.initial
                      ? 'Reading the package database'
                      : 'Nothing installed matched'
              }
              message={
                tab === 'search'
                  ? 'Type a package name above. Results come straight from the distro repositories.'
                  : tab === 'updates' && !updates.initial
                    ? 'Refresh the index first if the server has not checked in a while.'
                    : undefined
              }
            />
          }
          footer={
            <>
              <span>{rows.length} packages shown</span>
              <span className="mono">{pm ?? 'no package manager'}</span>
            </>
          }
        />

        {output ? (
          <Panel className="m-3 shrink-0">
            <PanelHeader
              title={outputTitle}
              subtitle="Output from the package manager"
              actions={
                <Button size="xs" variant="ghost" onClick={() => setOutput('')}>
                  Dismiss
                </Button>
              }
            />
            <div className="p-2.5">
              <CodeBlock code={output} tone="ink" maxHeight="max-h-52" wrap />
            </div>
          </Panel>
        ) : null}
      </div>

      {searching ? (
        <div className={cn('flex items-center gap-2 border-t border-line px-3 py-1.5 text-[11px] text-ink-faint')}>
          <Spinner /> Searching the repositories…
        </div>
      ) : null}
    </div>
  )
}
