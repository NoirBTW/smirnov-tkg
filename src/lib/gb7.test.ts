import { describe, expect, it } from 'vitest'
import { decodeGb7, encodeGb7, type ImageDocument } from './gb7'

describe('GrayBit-7 codec', () => {
  it('round-trips dimensions, grayscale and mask', () => {
    const source: ImageDocument = {
      name: 'test.png',
      format: 'PNG',
      width: 2,
      height: 1,
      colorDepth: 32,
      hasMask: true,
      channelMode: 'rgba',
      pixels: new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]),
    }

    const decoded = decodeGb7(encodeGb7(source))
    expect(decoded.width).toBe(2)
    expect(decoded.height).toBe(1)
    expect(Array.from(decoded.pixels)).toEqual([255, 255, 255, 255, 0, 0, 0, 0])
  })

  it('rejects a bad signature', () => {
    expect(() => decodeGb7(new Uint8Array(12).buffer)).toThrow('сигнатура')
  })
})
