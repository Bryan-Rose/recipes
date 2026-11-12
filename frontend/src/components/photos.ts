import type { ImageUpload } from '../api/types'

// The longest side Claude gets; enough to read cookbook print, and keeps each upload well under 1 MB.
const MAX_SIDE = 1600
const THUMB_SIDE = 400

/** A photo as a base64 JPEG (no data: prefix), scaled down to `maxSide`. Rejects images the browser can't decode. */
export async function toJpeg(file: Blob, maxSide = MAX_SIDE): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  try {
    const context = canvas.getContext('2d')
    // Without this the upload would be a blank JPEG.
    if (!context) throw new Error('No 2D canvas')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  } finally {
    bitmap.close()
  }
  const url = canvas.toDataURL('image/jpeg', 0.85)
  return url.slice(url.indexOf(',') + 1)
}

/** A recipe image: the full picture and a thumbnail for the recipe list. */
export async function toImageUpload(file: Blob): Promise<ImageUpload> {
  const [full, thumb] = await Promise.all([toJpeg(file), toJpeg(file, THUMB_SIDE)])
  return { full, thumb }
}

export const jpegUrl = (photo: string) => `data:image/jpeg;base64,${photo}`
