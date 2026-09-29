import type { ImageDocument } from './gb7'

export type ChannelKey = 'gray' | 'red' | 'green' | 'blue' | 'alpha'
export type ChannelState = Record<ChannelKey, boolean>

export type LabColor = {
  l: number
  a: number
  b: number
}

export const DEFAULT_CHANNELS: ChannelState = {
  gray: true,
  red: true,
  green: true,
  blue: true,
  alpha: true,
}

export function visibleChannels(document: ImageDocument): ChannelKey[] {
  if (document.channelMode === 'gray') return ['gray']
  if (document.channelMode === 'gray-alpha') return ['gray', 'alpha']
  if (document.channelMode === 'rgb') return ['red', 'green', 'blue']
  return ['red', 'green', 'blue', 'alpha']
}

export function applyChannelVisibility(
  document: ImageDocument,
  channels: ChannelState,
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(document.pixels.length)
  const available = visibleChannels(document)
  const colorChannels = available.filter((channel) => channel !== 'alpha')
  const alphaOnly = available.includes('alpha')
    && channels.alpha
    && colorChannels.every((channel) => !channels[channel])

  for (let index = 0; index < document.pixels.length; index += 4) {
    const sourceAlpha = document.pixels[index + 3]
    if (alphaOnly) {
      result[index] = sourceAlpha
      result[index + 1] = sourceAlpha
      result[index + 2] = sourceAlpha
      result[index + 3] = 255
      continue
    }

    if (document.channelMode === 'gray' || document.channelMode === 'gray-alpha') {
      const gray = channels.gray ? document.pixels[index] : 0
      result[index] = gray
      result[index + 1] = gray
      result[index + 2] = gray
    } else {
      result[index] = channels.red ? document.pixels[index] : 0
      result[index + 1] = channels.green ? document.pixels[index + 1] : 0
      result[index + 2] = channels.blue ? document.pixels[index + 2] : 0
    }
    result[index + 3] = available.includes('alpha') && channels.alpha ? sourceAlpha : 255
  }

  return result
}

function srgbToLinear(value: number) {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

export function rgbToLab(red: number, green: number, blue: number): LabColor {
  const r = srgbToLinear(red)
  const g = srgbToLinear(green)
  const b = srgbToLinear(blue)

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.072175) / 1
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883

  const pivot = (value: number) => value > 0.008856
    ? Math.cbrt(value)
    : 7.787 * value + 16 / 116

  const fx = pivot(x)
  const fy = pivot(y)
  const fz = pivot(z)

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export function createChannelPreview(
  document: ImageDocument,
  channel: ChannelKey,
  width: number,
  height: number,
): ImageData {
  const output = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(document.height - 1, Math.floor(y * document.height / height))
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(document.width - 1, Math.floor(x * document.width / width))
      const source = (sourceY * document.width + sourceX) * 4
      const target = (y * width + x) * 4
      const value = channel === 'green' ? document.pixels[source + 1]
        : channel === 'blue' ? document.pixels[source + 2]
          : channel === 'alpha' ? document.pixels[source + 3]
            : document.pixels[source]

      output[target] = channel === 'red' ? value : channel === 'green' || channel === 'blue' ? 0 : value
      output[target + 1] = channel === 'green' ? value : channel === 'red' || channel === 'blue' ? 0 : value
      output[target + 2] = channel === 'blue' ? value : channel === 'red' || channel === 'green' ? 0 : value
      output[target + 3] = 255
    }
  }

  return new ImageData(output, width, height)
}
