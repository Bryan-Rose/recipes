import { afterEach, expect, test, vi } from 'vitest'
import { base64Blob, toImageUpload } from './photos'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('toImageUpload decodes the photo once and draws it at both sizes', async () => {
  const close = vi.fn()
  const decode = vi.fn(async () => ({ width: 3200, height: 2400, close }))
  vi.stubGlobal('createImageBitmap', decode)
  const sizes: string[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    sizes.push(`${this.width}x${this.height}`)
    return `data:image/jpeg;base64,${this.width}`
  })

  expect(await toImageUpload(new Blob())).toEqual({ full: '1600', thumb: '400' })
  expect(decode).toHaveBeenCalledTimes(1)
  expect(sizes).toEqual(['1600x1200', '400x300'])
  expect(close).toHaveBeenCalledTimes(1)
})

test('base64Blob decodes to the raw bytes', async () => {
  const bytes = Uint8Array.of(0xff, 0xd8, 0x00, 0x7f, 0x80)
  const blob = base64Blob(btoa(String.fromCharCode(...bytes)))
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
})
