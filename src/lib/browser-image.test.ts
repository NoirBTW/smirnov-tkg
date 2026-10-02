import { describe, expect, it } from 'vitest'
import { readPngMetadata } from './browser-image'

function pngHeader(bitDepth: number, colorType: number) {
  const bytes = new Uint8Array(26)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes[24] = bitDepth
  bytes[25] = colorType
  return bytes
}

describe('PNG metadata', () => {
  it.each([
    [0, true, false, 8],
    [2, false, false, 24],
    [4, true, true, 16],
    [6, false, true, 32],
  ])('recognizes color type %i', (colorType, grayscale, hasAlpha, depth) => {
    expect(readPngMetadata(pngHeader(8, colorType))).toEqual({ grayscale, hasAlpha, depth })
  })

  it('rejects an incomplete PNG signature', () => {
    const bytes = pngHeader(8, 6)
    bytes[7] = 0
    expect(readPngMetadata(bytes)).toBeNull()
  })
})
