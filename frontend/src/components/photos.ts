// The longest side Claude gets; enough to read cookbook print, and keeps each upload well under 1 MB.
const MAX_SIDE = 1600

/** A photo as a base64 JPEG (no data: prefix), scaled down to MAX_SIDE. Rejects images the browser can't decode. */
export async function toJpeg(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
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
