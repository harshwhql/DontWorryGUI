import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  ChevronRight,
  Download,
  Eye,
  File,
  FileArchive,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus2,
  Home,
  Link2,
  Lock,
  Pencil,
  Search,
  Trash2,
  Upload
} from 'lucide-react'
import type { FileEntry } from '@shared/types'
import { api } from '../../lib/api'
import { bytes, breadcrumbs, cn, dateTime, octal } from '../../lib/format'
import { useResource } from '../../lib/hooks'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  IconButton,
  Input,
  Panel,
  Toggle
} from '../../components/ui/primitives'
import { DataTable, KeyValue, type Column } from '../../components/ui/data'
import { Modal } from '../../components/ui/overlay'
import { ActionButton, CommandPeek } from '../../components/ActionButton'
import { ViewHeader } from '../../components/layout/ViewHeader'
import { useApp } from '../../state/store'
import { FileEditor } from './FileEditor'

interface ListPayload {
  path: string
  entries: FileEntry[]
}

const TEXT_EXT = /\.(txt|log|conf|cfg|ini|env|yaml|yml|json|toml|md|sh|bash|zsh|py|js|ts|rb|go|rs|php|sql|service|timer|socket|nginx|html|css|xml|properties|list|repo|rules)$/i
const ARCHIVE_EXT = /\.(zip|tar|gz|tgz|bz2|tbz2|xz|txz|7z|rar)$/i

function iconFor(entry: FileEntry): typeof File {
  if (entry.kind === 'directory') return Folder
  if (entry.kind === 'symlink') return Link2
  if (ARCHIVE_EXT.test(entry.name)) return FileArchive
  if (/\.(sh|bash|py|js|ts|rb|go|rs|php)$/i.test(entry.name)) return FileCode2
  if (TEXT_EXT.test(entry.name)) return FileText
  return File
}

export function FilesView(): React.JSX.Element {
  const run = useApp((s) => s.run)
  const toast = useApp((s) => s.toast)
  const facts = useApp((s) => s.activeConnection()?.facts)

  const [path, setPath] = useState('/')
  const [pathDraft, setPathDraft] = useState('/')
  const [showHidden, setShowHidden] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [detail, setDetail] = useState<FileEntry | null>(null)
  const [dialog, setDialog] = useState<
    null | 'mkdir' | 'touch' | 'rename' | 'chmod' | 'chown' | 'archive' | 'search'
  >(null)
  const [input, setInput] = useState('')
  const [input2, setInput2] = useState('')
  const [recursive, setRecursive] = useState(false)
  const [searchResults, setSearchResults] = useState<string[] | null>(null)

  const listing = useResource<ListPayload>('files.list', { path })

  // land in the user's home directory on first open
  useEffect(() => {
    if (!facts || path !== '/') return
    let cancelled = false
    void run<string>('files.home', {}, { quiet: true }).then((home) => {
      if (!cancelled && home && home !== '/') {
        setPath(home)
        setPathDraft(home)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts?.hostname])

  useEffect(() => {
    setPathDraft(listing.data?.path ?? path)
    setSelection([])
    setDetail(null)
  }, [listing.data?.path, path])

  const entries = useMemo(() => {
    const all = listing.data?.entries ?? []
    return showHidden ? all : all.filter((entry) => !entry.name.startsWith('.'))
  }, [listing.data, showHidden])

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selection.includes(entry.path)),
    [entries, selection]
  )

  const navigate = useCallback((next: string) => {
    setPath(next)
    setSearchResults(null)
  }, [])

  const toggleSelect = (entry: FileEntry, additive: boolean): void => {
    setSelection((prev) => {
      if (!additive) return prev.includes(entry.path) && prev.length === 1 ? [] : [entry.path]
      return prev.includes(entry.path)
        ? prev.filter((p) => p !== entry.path)
        : [...prev, entry.path]
    })
  }

  const open = (entry: FileEntry): void => {
    if (entry.kind === 'directory') {
      navigate(entry.path)
      return
    }
    if (entry.kind === 'symlink') {
      navigate(entry.linkTarget?.startsWith('/') ? entry.linkTarget : `${path}/${entry.linkTarget}`)
      return
    }
    setEditing(entry.path)
  }

  const download = async (entry: FileEntry): Promise<void> => {
    const target = await api.dialog.pickSaveTarget(entry.name)
    if (!target) return
    await run(
      'files.download',
      { remotePath: entry.path, localPath: target },
      { successMessage: `Downloaded ${entry.name}` }
    )
  }

  const upload = async (): Promise<void> => {
    const files = await api.dialog.pickFile({ multiple: true, title: 'Choose files to upload' })
    if (files.length === 0) return
    for (const file of files) {
      await run('files.upload', { localPath: file, remoteDir: path }, { quiet: true })
    }
    toast({ tone: 'success', title: `Uploaded ${files.length} file(s) to ${path}` })
    void listing.refresh(true)
  }

  const openDialog = (
    which: NonNullable<typeof dialog>,
    seed = '',
    seed2 = ''
  ): void => {
    setInput(seed)
    setInput2(seed2)
    setRecursive(false)
    setDialog(which)
  }

  const afterWrite = (): void => {
    setDialog(null)
    setSelection([])
    void listing.refresh(true)
  }

  const columns: Column<FileEntry>[] = [
    {
      key: 'name',
      header: 'Name',
      width: 'minmax(180px,1.6fr)',
      sort: (row) => `${row.kind === 'directory' ? 0 : 1}${row.name}`,
      render: (row) => {
        const Icon = iconFor(row)
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <Icon
              size={13}
              className={cn(
                'shrink-0',
                row.kind === 'directory'
                  ? 'text-info'
                  : row.kind === 'symlink'
                    ? 'text-root'
                    : 'text-ink-ghost'
              )}
              aria-hidden
            />
            <span className={cn('truncate', row.kind === 'directory' ? 'text-ink' : 'text-ink-dim')}>
              {row.name}
            </span>
            {row.linkTarget ? (
              <span className="mono truncate text-[10px] text-ink-ghost">→ {row.linkTarget}</span>
            ) : null}
          </span>
        )
      }
    },
    {
      key: 'size',
      header: 'Size',
      width: '78px',
      align: 'right',
      sort: (row) => row.sizeBytes,
      className: 'mono',
      render: (row) => (row.kind === 'directory' ? '—' : bytes(row.sizeBytes))
    },
    {
      key: 'modified',
      header: 'Modified',
      width: '132px',
      sort: (row) => row.modifiedAt,
      className: 'mono text-[10.5px]',
      render: (row) => dateTime(row.modifiedAt)
    },
    {
      key: 'mode',
      header: 'Permissions',
      width: '124px',
      sort: (row) => row.mode,
      render: (row) => (
        <span className="mono flex items-center gap-1.5 text-[10.5px]">
          <span className="text-ink-faint">{row.modeString}</span>
          <span className="text-ink-ghost">{octal(row.mode)}</span>
        </span>
      )
    },
    {
      key: 'owner',
      header: 'Owner',
      width: 'minmax(90px,120px)',
      sort: (row) => row.owner,
      className: 'mono text-[10.5px]',
      render: (row) => (
        <span className={row.owner === 'root' ? 'text-root' : 'text-ink-faint'}>
          {row.owner}:{row.group}
        </span>
      )
    },
    {
      key: 'actions',
      header: '',
      width: '92px',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          {row.kind === 'file' ? (
            <>
              <IconButton
                icon={Pencil}
                label={`Edit ${row.name}`}
                size="xs"
                onClick={(event) => {
                  event.stopPropagation()
                  setEditing(row.path)
                }}
              />
              <IconButton
                icon={Download}
                label={`Download ${row.name}`}
                size="xs"
                onClick={(event) => {
                  event.stopPropagation()
                  void download(row)
                }}
              />
            </>
          ) : (
            <IconButton
              icon={FolderOpen}
              label={`Open ${row.name}`}
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                open(row)
              }}
            />
          )}
          <IconButton
            icon={Eye}
            label={`Details for ${row.name}`}
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              setDetail(row)
            }}
          />
        </span>
      )
    }
  ]

  const crumbs = breadcrumbs(listing.data?.path ?? path)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        icon={FolderOpen}
        title="Files"
        subtitle={`${entries.length} items${selection.length ? ` · ${selection.length} selected` : ''}`}
        onRefresh={() => void listing.refresh()}
        refreshing={listing.loading}
        lastUpdated={listing.lastUpdated}
      >
        <Button size="sm" variant="outline" icon={FolderPlus} onClick={() => openDialog('mkdir')}>
          New folder
        </Button>
        <Button size="sm" variant="outline" icon={FilePlus2} onClick={() => openDialog('touch')}>
          New file
        </Button>
        <Button size="sm" variant="outline" icon={Upload} onClick={() => void upload()}>
          Upload
        </Button>
        <Button size="sm" variant="outline" icon={Search} onClick={() => openDialog('search')}>
          Search
        </Button>
      </ViewHeader>

      {/* path bar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-void/40 px-3 py-1.5">
        <IconButton
          icon={ArrowUp}
          label="Go up one level"
          size="xs"
          disabled={(listing.data?.path ?? path) === '/'}
          onClick={() => {
            const current = listing.data?.path ?? path
            const parent = current.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'
            navigate(parent)
          }}
        />
        <IconButton
          icon={Home}
          label="Go to the home directory"
          size="xs"
          onClick={() => {
            void run<string>('files.home', {}, { quiet: true }).then((home) => home && navigate(home))
          }}
        />

        <nav aria-label="Path" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center">
              {index > 0 ? (
                <ChevronRight size={10} className="text-ink-ghost" aria-hidden />
              ) : null}
              <button
                type="button"
                onClick={() => navigate(crumb.path)}
                className={cn(
                  'mono rounded-xs px-1 py-0.5 text-[11px] transition-colors hover:bg-hover',
                  index === crumbs.length - 1 ? 'text-ink' : 'text-ink-faint hover:text-ink-dim'
                )}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>

        <Input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') navigate(pathDraft.trim() || '/')
          }}
          mono
          className="h-6 w-64 text-[11px]"
          aria-label="Jump to path"
          placeholder="/etc/nginx"
        />
        <CommandPeek actionId="files.list" params={{ path: listing.data?.path ?? path }} />
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10.5px] text-ink-faint">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(event) => setShowHidden(event.target.checked)}
            className="size-3 accent-[var(--color-accent)]"
          />
          Hidden files
        </label>
      </div>

      {/* bulk action bar */}
      {selection.length > 0 ? (
        <div className="anim-fade-up flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-accent/6 px-3 py-1.5">
          <Badge tone="run">{selection.length} selected</Badge>
          {selection.length === 1 ? (
            <Button
              size="xs"
              variant="outline"
              icon={Pencil}
              onClick={() => openDialog('rename', selectedEntries[0]?.name ?? '')}
            >
              Rename
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            icon={Lock}
            onClick={() => openDialog('chmod', octal(selectedEntries[0]?.mode ?? 0o644))}
          >
            Permissions
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              openDialog('chown', `${selectedEntries[0]?.owner}:${selectedEntries[0]?.group}`)
            }
          >
            Owner
          </Button>
          <Button
            size="xs"
            variant="outline"
            icon={FileArchive}
            onClick={() => openDialog('archive', `archive-${Date.now()}.tar.gz`)}
          >
            Compress
          </Button>
          <ActionButton
            actionId="files.remove"
            params={{ paths: selection }}
            icon={Trash2}
            variant="danger"
            size="xs"
            options={{
              successMessage: `Deleted ${selection.length} item(s)`,
              confirmBody: `${selection.length} item(s) will be removed recursively with rm -rf. There is no recycle bin on a server.`
            }}
            onDone={afterWrite}
          >
            Delete
          </ActionButton>
          <div className="flex-1" />
          <Button size="xs" variant="ghost" onClick={() => setSelection([])}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {listing.error ? (
        <ErrorNote message={listing.error} onRetry={() => void listing.refresh()} />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <DataTable
          rows={entries}
          columns={columns}
          rowKey={(row) => row.path}
          onRowClick={(row) => toggleSelect(row, false)}
          onRowDoubleClick={open}
          isSelected={(row) => selection.includes(row.path)}
          defaultSortKey="name"
          defaultSortDir="asc"
          emptyState={
            <EmptyState
              icon={Folder}
              title={listing.initial ? 'Reading the directory' : 'This folder is empty'}
              message={
                listing.initial
                  ? undefined
                  : showHidden
                    ? 'Nothing here at all.'
                    : 'There may be hidden files. Tick “Hidden files” to show them.'
              }
            />
          }
          footer={
            <>
              <span>
                {entries.filter((e) => e.kind === 'directory').length} folders ·{' '}
                {entries.filter((e) => e.kind !== 'directory').length} files ·{' '}
                {bytes(entries.reduce((sum, e) => sum + (e.kind === 'file' ? e.sizeBytes : 0), 0))}
              </span>
              <span className="mono">sftp readdir · double-click a row to open it</span>
            </>
          }
        />

        {detail ? (
          <aside className="anim-fade-up flex w-[340px] shrink-0 flex-col border-l border-line bg-surface/60 p-3">
            <div className="mb-2 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="mono truncate text-[12.5px] font-semibold text-ink">{detail.name}</h2>
                <p className="mono mt-0.5 break-all text-[10.5px] text-ink-ghost">{detail.path}</p>
              </div>
              <IconButton icon={Eye} label="Close details" onClick={() => setDetail(null)} />
            </div>

            <KeyValue
              dense
              rows={[
                { label: 'Kind', value: detail.kind },
                { label: 'Size', value: bytes(detail.sizeBytes), mono: true },
                { label: 'Modified', value: dateTime(detail.modifiedAt), mono: true },
                { label: 'Permissions', value: `${detail.modeString} (${octal(detail.mode)})`, mono: true },
                { label: 'Owner', value: `${detail.owner}:${detail.group}`, mono: true },
                { label: 'uid:gid', value: `${detail.uid}:${detail.gid}`, mono: true },
                ...(detail.linkTarget ? [{ label: 'Link target', value: detail.linkTarget, mono: true }] : [])
              ]}
            />

            <div className="mt-3 flex flex-wrap gap-1.5">
              {detail.kind === 'file' ? (
                <>
                  <Button size="xs" variant="secondary" icon={Pencil} onClick={() => setEditing(detail.path)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="outline" icon={Download} onClick={() => void download(detail)}>
                    Download
                  </Button>
                </>
              ) : (
                <Button size="xs" variant="secondary" icon={FolderOpen} onClick={() => open(detail)}>
                  Open
                </Button>
              )}
              {detail.kind === 'directory' ? (
                <ActionButton
                  actionId="files.size"
                  params={{ path: detail.path }}
                  size="xs"
                  variant="outline"
                  options={{ quiet: true }}
                  onDone={(size) =>
                    toast({
                      tone: 'info',
                      title: `${detail.name} uses ${bytes(Number(size))}`
                    })
                  }
                >
                  Measure size
                </ActionButton>
              ) : null}
              {ARCHIVE_EXT.test(detail.name) ? (
                <ActionButton
                  actionId="files.extract"
                  params={{ archive: detail.path, target: listing.data?.path ?? path }}
                  size="xs"
                  variant="outline"
                  icon={FileArchive}
                  options={{ successMessage: 'Archive extracted' }}
                  onDone={afterWrite}
                >
                  Extract here
                </ActionButton>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {/* ------------- dialogs ------------- */}

      <Modal
        open={dialog === 'mkdir' || dialog === 'touch'}
        onClose={() => setDialog(null)}
        title={dialog === 'mkdir' ? 'New folder' : 'New file'}
        subtitle={`Created inside ${listing.data?.path ?? path}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId={dialog === 'mkdir' ? 'files.mkdir' : 'files.touch'}
              params={{ path: `${(listing.data?.path ?? path).replace(/\/+$/, '')}/${input}` }}
              variant="primary"
              size="sm"
              disabled={!input.trim()}
              options={{ successMessage: dialog === 'mkdir' ? 'Folder created' : 'File created' }}
              onDone={afterWrite}
            >
              Create
            </ActionButton>
          </>
        }
      >
        <Field label="Name" required>
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={dialog === 'mkdir' ? 'releases' : 'notes.txt'}
            mono
          />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title="Rename"
        subtitle={selectedEntries[0]?.path}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="files.rename"
              params={{
                from: selectedEntries[0]?.path,
                to: `${(listing.data?.path ?? path).replace(/\/+$/, '')}/${input}`
              }}
              variant="primary"
              size="sm"
              disabled={!input.trim()}
              options={{ successMessage: 'Renamed' }}
              onDone={afterWrite}
            >
              Rename
            </ActionButton>
          </>
        }
      >
        <Field label="New name" required>
          <Input value={input} onChange={(event) => setInput(event.target.value)} mono />
        </Field>
      </Modal>

      <ChmodDialog
        open={dialog === 'chmod'}
        paths={selection}
        initial={input}
        recursive={recursive}
        onRecursive={setRecursive}
        onClose={() => setDialog(null)}
        onDone={afterWrite}
      />

      <Modal
        open={dialog === 'chown'}
        onClose={() => setDialog(null)}
        title="Change owner"
        subtitle={`${selection.length} item(s)`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="files.chown"
              params={{ paths: selection, owner: input, recursive }}
              variant="primary"
              size="sm"
              disabled={!input.trim()}
              options={{ successMessage: 'Owner changed' }}
              onDone={afterWrite}
            >
              Apply
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="owner:group" required hint="For example www-data:www-data">
            <Input value={input} onChange={(event) => setInput(event.target.value)} mono />
          </Field>
          <Toggle
            checked={recursive}
            onChange={setRecursive}
            label="Apply to everything inside"
            hint="Adds -R, which walks the whole tree."
            tone="warn"
          />
        </div>
      </Modal>

      <Modal
        open={dialog === 'archive'}
        onClose={() => setDialog(null)}
        title="Create a tar.gz archive"
        subtitle={`${selection.length} item(s) from ${listing.data?.path ?? path}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <ActionButton
              actionId="files.archive"
              params={{
                paths: selection,
                archive: `${(listing.data?.path ?? path).replace(/\/+$/, '')}/${input}`,
                cwd: listing.data?.path ?? path
              }}
              variant="primary"
              size="sm"
              disabled={!input.trim()}
              options={{ successMessage: 'Archive created' }}
              onDone={afterWrite}
            >
              Create archive
            </ActionButton>
          </>
        }
      >
        <Field label="Archive name" required>
          <Input value={input} onChange={(event) => setInput(event.target.value)} mono />
        </Field>
      </Modal>

      <Modal
        open={dialog === 'search'}
        onClose={() => {
          setDialog(null)
          setSearchResults(null)
        }}
        title="Search this server"
        subtitle={`Starting from ${listing.data?.path ?? path}`}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Close
            </Button>
            <ActionButton
              actionId="files.grep"
              params={{ path: listing.data?.path ?? path, query: input2 }}
              size="sm"
              variant="outline"
              disabled={!input2.trim()}
              options={{ quiet: true }}
              onDone={(data) => setSearchResults((data as string[]) ?? [])}
            >
              Search contents
            </ActionButton>
            <ActionButton
              actionId="files.search"
              params={{ path: listing.data?.path ?? path, query: input }}
              variant="primary"
              size="sm"
              disabled={!input.trim()}
              options={{ quiet: true }}
              onDone={(data) => setSearchResults((data as string[]) ?? [])}
            >
              Search names
            </ActionButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="File name contains" hint="Runs find -iname with wildcards on both sides.">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="nginx.conf"
              mono
            />
          </Field>
          <Field label="File contents contain" hint="Runs grep -rIn, skipping binary files.">
            <Input
              value={input2}
              onChange={(event) => setInput2(event.target.value)}
              placeholder="server_name"
              mono
            />
          </Field>

          {searchResults ? (
            <Panel className="max-h-72 overflow-y-auto">
              {searchResults.length === 0 ? (
                <EmptyState icon={Search} title="No matches" compact />
              ) : (
                <ul className="divide-y divide-line/50">
                  {searchResults.map((result, index) => {
                    const filePath = result.split(':')[0]
                    return (
                      <li key={`${result}-${index}`}>
                        <button
                          type="button"
                          onClick={() => {
                            const parent = filePath.split('/').slice(0, -1).join('/') || '/'
                            navigate(parent)
                            setDialog(null)
                            setSearchResults(null)
                          }}
                          className="mono block w-full truncate px-2.5 py-1 text-left text-[11px] text-ink-dim hover:bg-hover hover:text-ink"
                          title={result}
                        >
                          {result}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      </Modal>

      <FileEditor
        path={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void listing.refresh(true)}
      />
    </div>
  )
}

// Permission editor. The checkbox grid and the octal value stay in sync, so people who
// think in rwx and people who think in 644 can both use it.

const CLASSES = [
  { key: 'owner', label: 'Owner' },
  { key: 'group', label: 'Group' },
  { key: 'other', label: 'Everyone' }
] as const

const BITS = [
  { key: 'r', label: 'Read', value: 4 },
  { key: 'w', label: 'Write', value: 2 },
  { key: 'x', label: 'Execute', value: 1 }
] as const

function ChmodDialog({
  open,
  paths,
  initial,
  recursive,
  onRecursive,
  onClose,
  onDone
}: {
  open: boolean
  paths: string[]
  initial: string
  recursive: boolean
  onRecursive: (next: boolean) => void
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [mode, setMode] = useState(initial || '0644')

  useEffect(() => {
    if (open) setMode(initial || '0644')
  }, [open, initial])

  const digits = useMemo(() => {
    const padded = mode.replace(/\D/g, '').padStart(4, '0').slice(-4)
    return [Number(padded[1]), Number(padded[2]), Number(padded[3])]
  }, [mode])

  const toggle = (classIndex: number, bitValue: number): void => {
    const next = [...digits]
    next[classIndex] = next[classIndex] ^ bitValue
    setMode(`0${next.join('')}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Permissions"
      subtitle={paths.length === 1 ? paths[0] : `${paths.length} items`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <ActionButton
            actionId="files.chmod"
            params={{ paths, mode, recursive }}
            variant="primary"
            size="sm"
            options={{ successMessage: `Permissions set to ${mode}` }}
            onDone={onDone}
          >
            Apply {mode}
          </ActionButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-md border border-line">
          <div
            className="grid items-center gap-2 border-b border-line bg-void/50 px-3 py-1.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-faint"
            style={{ gridTemplateColumns: '90px repeat(3, 1fr)' }}
          >
            <span />
            {BITS.map((bit) => (
              <span key={bit.key} className="text-center">
                {bit.label}
              </span>
            ))}
          </div>
          {CLASSES.map((cls, classIndex) => (
            <div
              key={cls.key}
              className="grid items-center gap-2 border-b border-line/40 px-3 py-1.5 last:border-0"
              style={{ gridTemplateColumns: '90px repeat(3, 1fr)' }}
            >
              <span className="text-[11.5px] text-ink-dim">{cls.label}</span>
              {BITS.map((bit) => (
                <label key={bit.key} className="flex cursor-pointer justify-center">
                  <input
                    type="checkbox"
                    checked={(digits[classIndex] & bit.value) !== 0}
                    onChange={() => toggle(classIndex, bit.value)}
                    aria-label={`${cls.label} ${bit.label}`}
                    className="size-3.5 accent-[var(--color-accent)]"
                  />
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Octal mode" hint="Edit either side; they stay in sync.">
            <Input value={mode} onChange={(event) => setMode(event.target.value)} mono />
          </Field>
          <div className="flex items-end">
            <div className="flex flex-wrap gap-1">
              {['0644', '0640', '0600', '0755', '0750', '0700'].map((preset) => (
                <Button
                  key={preset}
                  size="xs"
                  variant={mode === preset ? 'primary' : 'outline'}
                  onClick={() => setMode(preset)}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <Toggle
          checked={recursive}
          onChange={onRecursive}
          label="Apply to everything inside"
          hint="Adds -R. Be careful with execute bits on whole trees."
          tone="warn"
        />
      </div>
    </Modal>
  )
}
