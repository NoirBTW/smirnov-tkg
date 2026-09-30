import type { ImageDocument } from './gb7'

export type LevelsChannel = 'master' | 'gray' | 'red' | 'green' | 'blue' | 'alpha'

export type LevelSettings = {
  black: number
  gamma: number
  white: number
}

export type LevelsSettings = Record<LevelsChannel, LevelSettings>

export type Histogram = {
  bins: Uint32Array
  domainMax: number
  pixelCount: number
}

export function levelsChannels(document: ImageDocument): LevelsChannel[] {
  if (document.channelMode === 'gray') return ['master', 'gray']
  if (document.channelMode === 'gray-alpha') return ['master', 'gray', 'alpha']
  if (document.channelMode === 'rgb') return ['master', 'red', 'green', 'blue']
  return ['master', 'red', 'green', 'blue', 'alpha']
}

export function levelDomainMax(document: ImageDocument, channel: LevelsChannel): number {
  return document.format === 'GB7' && channel !== 'alpha' ? 127 : 255
}

export function createDefaultLevels(document: ImageDocument): LevelsSettings {
  const create = (channel: LevelsChannel): LevelSettings => ({
    black: 0,
    gamma: 1,
    white: levelDomainMax(document, channel),
  })

  return {
    master: create('master'),
    gray: create('gray'),
    red: create('red'),
    green: create('green'),
    blue: create('blue'),
    alpha: create('alpha'),
  }
}

function linearSrgb(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance(red: number, green: number, blue: number) {
  return 0.2126 * linearSrgb(red) + 0.7152 * linearSrgb(green) + 0.0722 * linearSrgb(blue)
}

export function buildHistogram(document: ImageDocument, channel: LevelsChannel): Histogram {
  const domainMax = levelDomainMax(document, channel)
  const bins = new Uint32Array(domainMax + 1)

  for (let index = 0; index < document.pixels.length; index += 4) {
    let normalized: number
    if (channel === 'master') {
      normalized = relativeLuminance(
        document.pixels[index],
        document.pixels[index + 1],
        document.pixels[index + 2],
      )
    } else {
      const offset = channel === 'green' ? 1 : channel === 'blue' ? 2 : channel === 'alpha' ? 3 : 0
      normalized = document.pixels[index + offset] / 255
    }
    bins[Math.min(domainMax, Math.max(0, Math.round(normalized * domainMax)))] += 1
  }

  return { bins, domainMax, pixelCount: document.width * document.height }
}

function isDefault(settings: LevelSettings, domainMax: number) {
  return settings.black === 0 && settings.white === domainMax && settings.gamma === 1
}

export function createLevelsLut(settings: LevelSettings, domainMax: number): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  if (isDefault(settings, domainMax)) {
    for (let value = 0; value < 256; value += 1) lut[value] = value
    return lut
  }

  const span = Math.max(1, settings.white - settings.black)
  for (let value = 0; value < 256; value += 1) {
    const domainValue = value * domainMax / 255
    const normalized = Math.min(1, Math.max(0, (domainValue - settings.black) / span))
    const corrected = normalized ** settings.gamma
    lut[value] = Math.round(corrected * 255)
  }
  return lut
}

export function applyLevels(document: ImageDocument, settings: LevelsSettings): Uint8ClampedArray {
  const output = new Uint8ClampedArray(document.pixels)
  const master = createLevelsLut(settings.master, levelDomainMax(document, 'master'))
  const gray = createLevelsLut(settings.gray, levelDomainMax(document, 'gray'))
  const red = createLevelsLut(settings.red, levelDomainMax(document, 'red'))
  const green = createLevelsLut(settings.green, levelDomainMax(document, 'green'))
  const blue = createLevelsLut(settings.blue, levelDomainMax(document, 'blue'))
  const alpha = createLevelsLut(settings.alpha, 255)
  const grayscale = document.channelMode === 'gray' || document.channelMode === 'gray-alpha'

  for (let index = 0; index < output.length; index += 4) {
    if (grayscale) {
      const adjusted = gray[master[document.pixels[index]]]
      output[index] = adjusted
      output[index + 1] = adjusted
      output[index + 2] = adjusted
    } else {
      output[index] = red[master[document.pixels[index]]]
      output[index + 1] = green[master[document.pixels[index + 1]]]
      output[index + 2] = blue[master[document.pixels[index + 2]]]
    }

    if (document.channelMode === 'gray-alpha' || document.channelMode === 'rgba') {
      output[index + 3] = alpha[document.pixels[index + 3]]
    }
  }

  return output
}

export function gammaToPosition(settings: LevelSettings) {
  const span = Math.max(1, settings.white - settings.black)
  const normalized = Math.min(1, Math.max(0, (Math.log10(settings.gamma) + 1) / 2))
  return settings.black + normalized * span
}

export function positionToGamma(position: number, black: number, white: number) {
  const normalized = Math.min(1, Math.max(0, (position - black) / Math.max(1, white - black)))
  return Math.min(9.9, Math.max(0.1, 10 ** (normalized * 2 - 1)))
}
