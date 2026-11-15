import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { pcfReceiptUrl } from './pcfApi'

interface ReceiptPreviewProps {
  path: string | null
  label?: string
  onClose: () => void
}

export function ReceiptPreview({ path, label, onClose }: ReceiptPreviewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return
    let cancelled = false
    setUrl(null)
    setError(null)
    pcfReceiptUrl(path)
      .then((signed) => {
        if (cancelled) return
        if (signed) setUrl(signed)
        else setError('Receipt could not be opened.')
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (!path) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="Receipt"
      subtitle={label}
      size="xl"
      footer={
        <>
          {url ? (
            <Button
              variant="secondary"
              onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
            >
              Open in new tab
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="receipt-preview">
        {error ? (
          <p className="form-error">{error}</p>
        ) : !url ? (
          <p className="muted">Loading receipt…</p>
        ) : /\.pdf$/i.test(path) ? (
          <iframe className="receipt-preview-frame" src={url} title="Receipt PDF" />
        ) : (
          <img className="receipt-preview-img" src={url} alt={`Receipt ${label ?? ''}`.trim()} />
        )}
      </div>
    </Modal>
  )
}
