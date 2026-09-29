import { describe, expect, it } from 'vitest'
import { applyChannelVisibility, DEFAULT_CHANNELS, rgbToLab } from './color'
import type { ImageDocument } from './gb7'

const rgbaDocument: ImageDocument = {
  name: 'pixel.png',
  format: 'PNG',
  width: 1,
  height: 1,
  colorDepth: 32,
  hasMask: true,
  channelMode: 'rgba',
  pixels: new Uint8ClampedArray([120, 80, 40, 64]),
}

describe('color channels', () => {
  it('hides independent RGB channels without changing source pixels', () => {
    const sourceBefore = Array.from(rgbaDocument.pixels)
    const result = applyChannelVisibility(rgbaDocument, {
      ...DEFAULT_CHANNELS,
      green: false,
    })

    expect(Array.from(result)).toEqual([120, 0, 40, 64])
    expect(Array.from(rgbaDocument.pixels)).toEqual(sourceBefore)
  })

  it('renders alpha as a visible grayscale mask when it is the only channel', () => {
    const result = applyChannelVisibility(rgbaDocument, {
      gray: false,
      red: false,
      green: false,
      blue: false,
      alpha: true,
    })

    expect(Array.from(result)).toEqual([64, 64, 64, 255])
  })
})

describe('CIELAB conversion', () => {
  it('converts reference white close to D65 Lab', () => {
    const lab = rgbToLab(255, 255, 255)
    expect(lab.l).toBeCloseTo(100, 2)
    expect(lab.a).toBeCloseTo(0, 2)
    expect(lab.b).toBeCloseTo(0, 2)
  })
})
