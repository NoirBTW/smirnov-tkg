import { describe, expect, it } from 'vitest'
import { resizeBilinear, resizeImageDocument, resizeNearest, validateTargetSize } from './resampling'
import type { ImageDocument } from './gb7'

const pixels = new Uint8ClampedArray([
  0, 0, 0, 255,       100, 0, 0, 255,
  0, 100, 0, 255,     100, 100, 100, 255,
])

describe('resampling', () => {
  it('uses the nearest source pixel for each target pixel', () => {
    const resized = resizeNearest(pixels, 2, 2, 4, 4)
    expect(Array.from(resized.slice(0, 4))).toEqual([0, 0, 0, 255])
    expect(Array.from(resized.slice((3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 4))).toEqual([100, 100, 100, 255])
    expect(Array.from(resized.slice((0 * 4 + 3) * 4, (0 * 4 + 3) * 4 + 4))).toEqual([100, 0, 0, 255])
  })

  it('bilinearly mixes four surrounding pixels', () => {
    const resized = resizeBilinear(pixels, 2, 2, 3, 3)
    expect(Array.from(resized.slice(16, 20))).toEqual([50, 50, 25, 255])
  })

  it('does not mutate the original document', () => {
    const document: ImageDocument = {
      name: 'test.png', format: 'PNG', width: 2, height: 2,
      colorDepth: 24, hasMask: false, channelMode: 'rgb', pixels,
    }
    const original = Array.from(document.pixels)
    const resized = resizeImageDocument(document, 1, 1, 'bilinear')
    expect(resized).not.toBe(document)
    expect(resized.pixels).not.toBe(document.pixels)
    expect(Array.from(document.pixels)).toEqual(original)
    expect([resized.width, resized.height]).toEqual([1, 1])
  })

  it('validates target dimensions and memory limits', () => {
    expect(validateTargetSize(0, 10)).toContain('Минимальный')
    expect(validateTargetSize(10.5, 10)).toContain('целыми')
    expect(validateTargetSize(9000, 10)).toContain('8')
    expect(validateTargetSize(8000, 8000)).toContain('4 миллиона')
    expect(validateTargetSize(1920, 1080)).toBeNull()
  })
})
