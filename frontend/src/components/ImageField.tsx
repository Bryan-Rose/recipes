import { useId, useState } from 'react'

import type { ImageUpload } from '../api/types'
import { toImageUpload } from './photos'

/** A recipe's one image: shows it, and picks a replacement (converted to JPEGs here) or removes it. */
export function ImageField({
  src,
  busy = false,
  error,
  onPick,
  onRemove,
  onConverting,
}: {
  src: string | null
  busy?: boolean
  error?: string | null
  onPick: (image: ImageUpload) => void
  onRemove: () => void
  /** Told while a picked file is still converting, so a form can hold its save. */
  onConverting?: (converting: boolean) => void
}) {
  const id = useId()
  const [converting, setConverting] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  async function pick(file: File) {
    setPickError(null)
    setConverting(true)
    onConverting?.(true)
    try {
      onPick(await toImageUpload(file))
    } catch {
      setPickError(`Couldn’t open ${file.name}. Try a JPEG or PNG.`)
    } finally {
      setConverting(false)
      onConverting?.(false)
    }
  }

  return (
    <section className="card editor-section">
      <h2 className="section-heading">Photo</h2>
      {src ? <img className="recipe-cover" src={src} alt="Recipe photo" /> : <p className="empty-hint">No photo yet.</p>}
      <div className="row">
        <div className="field">
          <label htmlFor={id}>{src ? 'Replace photo' : 'Add a photo'}</label>
          <input
            id={id}
            type="file"
            accept="image/*"
            disabled={busy || converting}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void pick(file)
            }}
          />
        </div>
        {src && (
          <button type="button" className="ghost" disabled={busy || converting} onClick={onRemove}>
            Remove photo
          </button>
        )}
      </div>
      {converting && <p className="muted">Preparing photo…</p>}
      {(pickError ?? error) && <p className="error-box">{pickError ?? error}</p>}
    </section>
  )
}
