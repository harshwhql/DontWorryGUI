import { useEffect, useMemo, useState } from 'react'
import { FileWarning, Save } from 'lucide-react'
import { bytes } from '../../lib/format'
import { Badge, Button, Spinner } from '../../components/ui/primitives'
import { Modal } from '../../components/ui/overlay'
import { CommandPeek } from '../../components/ActionButton'
import { useApp } from '../../state/store'

interface ReadPayload {
  path: string
  content: string
  sizeBytes: number
  truncated: boolean
  binary: boolean
}

export function FileEditor({
  path,
  onClose,
  onSaved
}: {
  path: string | null
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
  const run = useApp((s) => s.run)
  const toast = useApp((s) => s.toast)

  const [payload, setPayload] = useState<ReadPayload | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!path) {
      setPayload(null)
      setDraft('')
      return
    }
    let cancelled = false
    setLoading(true)
    void run<ReadPayload>('files.read', { path }, { quiet: true })
      .then((data) => {
        if (cancelled) return
        if (!data) {
          toast({ tone: 'error', title: 'Could not read that file' })
          onClose()
          return
        }
        setPayload(data)
        setDraft(data.content)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  const dirty = useMemo(() => payload !== null && draft !== payload.content, [draft, payload])

  const save = async (): Promise<void> => {
    if (!path) return
    setSaving(true)
    try {
      const result = await run('files.write', { path, content: draft }, { successMessage: 'File saved' })
      if (result !== undefined) {
        setPayload((prev) => (prev ? { ...prev, content: draft } : prev))
        onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  const lines = draft ? draft.split('\n').length : 0

  return (
    <Modal
      open={Boolean(path)}
      onClose={() => {
        if (dirty && !window.confirm('Close without saving your changes?')) return
        onClose()
      }}
      title={path?.split('/').pop() ?? 'File'}
      subtitle={path}
      width="max-w-4xl"
      footer={
        <>
          <span className="mono text-[10.5px] text-ink-ghost">
            {lines} lines · {bytes(new TextEncoder().encode(draft).length)}
            {payload?.truncated ? ' · truncated at 2 MB' : ''}
          </span>
          <div className="flex-1" />
          {dirty ? <Badge tone="warn">unsaved changes</Badge> : null}
          <CommandPeek actionId="files.write" params={{ path }} size="sm" variant="outline" />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            icon={Save}
            loading={saving}
            disabled={!dirty || payload?.binary}
            onClick={() => void save()}
          >
            Save to server
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-ink-faint">
          <Spinner /> Reading the file over SFTP…
        </div>
      ) : payload?.binary ? (
        <div className="flex items-start gap-2.5 rounded-md border border-warn/30 bg-warn/8 p-3">
          <FileWarning size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <div>
            <p className="text-[12.5px] font-medium text-warn">This looks like a binary file</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-ink-dim">
              Editing it as text would corrupt it, so the editor is read-only here. Download it
              instead if you need to inspect the contents. It is {bytes(payload.sizeBytes)}.
            </p>
          </div>
        </div>
      ) : (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
          wrap="off"
          className="mono selectable h-[58vh] w-full resize-none overflow-auto rounded-md border border-line bg-void p-3 text-[12px] leading-[1.6] text-ink focus:border-run/50 focus:outline-none"
          aria-label={`Contents of ${path}`}
        />
      )}
    </Modal>
  )
}
