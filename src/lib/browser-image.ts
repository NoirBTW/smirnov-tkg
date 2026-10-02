import type { ImageDocument } from './gb7'

export type BrowserImageMetadata = {
  depth: number
  grayscale: boolean
  hasAlpha: boolean
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function readPngMetadata(bytes: Uint8Array): BrowserImageMetadata | null {
  if (bytes.length < 26 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null
  const bitDepth = bytes[24]
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const colorType = bytes[25]
  return {
    depth: bitDepth * (channels[colorType] ?? 1),
    grayscale: colorType === 0 || colorType === 4,
    hasAlpha: colorType === 4 || colorType === 6,
  }
}

function readJpegMetadata(bytes: Uint8Array): BrowserImageMetadata | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    const marker = bytes[offset + 1]
    if (marker === 0xd9 || marker === 0xda) break
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (length < 2) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      const components = bytes[offset + 9]
      return { depth: bytes[offset + 4] * components, grayscale: components === 1, hasAlpha: false }
    }
    offset += 2 + length
  }
  return null
}

export async function decodeBrowserImage(file: File): Promise<ImageDocument> {
  const format = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG'
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const metadata = format === 'PNG' ? readPngMetadata(bytes) : readJpegMetadata(bytes)
  const colorDepth = metadata?.depth ?? (format === 'PNG' ? 32 : 24)
  const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Браузер не предоставил Canvas 2D')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let containsTransparency = false
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] < 255) { containsTransparency = true; break }
  }
  const grayscale = metadata?.grayscale ?? false
  const hasMask = Boolean(metadata?.hasAlpha) || containsTransparency
  const channelMode = grayscale
    ? (hasMask ? 'gray-alpha' : 'gray')
    : (hasMask ? 'rgba' : 'rgb')
  return { name: file.name, format, width: canvas.width, height: canvas.height, colorDepth, hasMask, channelMode, pixels }
}
