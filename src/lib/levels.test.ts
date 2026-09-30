import { describe, expect, it } from 'vitest'
import {
  applyLevels, buildHistogram, createDefaultLevels, createLevelsLut,
  positionToGamma, relativeLuminance,
} from './levels'
import type { ImageDocument } from './gb7'

const rgbDocument: ImageDocument = {
  name: 'levels.png',
  format: 'PNG',
  width: 2,
  height: 1,
  colorDepth: 24,
  hasMask: false,
  channelMode: 'rgb',
  pixels: new Uint8ClampedArray([0, 128, 255, 255, 255, 0, 0, 255]),
}

describe('histogram', () => {
  it('uses linear sRGB relative luminance for the composite channel', () => {
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 6)
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 0, 0)).toBeCloseTo(0.2126, 4)
  })

  it('counts values in the selected channel', () => {
    const histogram = buildHistogram(rgbDocument, 'red')
    expect(histogram.bins[0]).toBe(1)
    expect(histogram.bins[255]).toBe(1)
    expect(histogram.pixelCount).toBe(2)
  })
})

describe('levels LUT', () => {
  it('keeps the identity mapping unchanged', () => {
    const lut = createLevelsLut({ black: 0, gamma: 1, white: 255 }, 255)
    expect(lut[0]).toBe(0)
    expect(lut[127]).toBe(127)
    expect(lut[255]).toBe(255)
  })

  it('clips black and white points', () => {
    const lut = createLevelsLut({ black: 50, gamma: 1, white: 200 }, 255)
    expect(lut[49]).toBe(0)
    expect(lut[50]).toBe(0)
    expect(lut[200]).toBe(255)
    expect(lut[220]).toBe(255)
  })

  it('preserves the source and applies channel settings independently', () => {
    const settings = createDefaultLevels(rgbDocument)
    settings.green = { black: 128, gamma: 1, white: 255 }
    const before = Array.from(rgbDocument.pixels)
    const output = applyLevels(rgbDocument, settings)
    expect(Array.from(output)).toEqual([0, 0, 255, 255, 255, 0, 0, 255])
    expect(Array.from(rgbDocument.pixels)).toEqual(before)
  })

  it('maps the middle marker to gamma 1', () => {
    expect(positionToGamma(127.5, 0, 255)).toBeCloseTo(1, 5)
  })
})
