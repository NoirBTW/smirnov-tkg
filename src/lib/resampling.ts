import type { ImageDocument } from './gb7'

export type InterpolationMethod = 'nearest' | 'bilinear'

export type InterpolationAlgorithm = {
  id: InterpolationMethod
  label: string
  description: string
  resize: (
    source: Uint8ClampedArray,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
  ) => Uint8ClampedArray
}

export const MAX_RESIZE_SIDE = 8192
export const MAX_RESIZE_PIXELS = 4_000_000

function assertRaster(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every(Number.isInteger)) {
    throw new Error('Размеры изображения должны быть целыми числами')
  }
  if (sourceWidth < 1 || sourceHeight < 1 || targetWidth < 1 || targetHeight < 1) {
    throw new Error('Ширина и высота должны быть больше нуля')
  }
  if (source.length !== sourceWidth * sourceHeight * 4) {
    throw new Error('Размер массива пикселей не соответствует изображению')
  }
}

export function resizeNearest(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  assertRaster(source, sourceWidth, sourceHeight, targetWidth, targetHeight)
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const scaleX = sourceWidth / targetWidth
  const scaleY = sourceHeight / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y + 0.5) * scaleY))
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x + 0.5) * scaleX))
      const sourceOffset = (sourceY * sourceWidth + sourceX) * 4
      const targetOffset = (y * targetWidth + x) * 4
      target[targetOffset] = source[sourceOffset]
      target[targetOffset + 1] = source[sourceOffset + 1]
      target[targetOffset + 2] = source[sourceOffset + 2]
      target[targetOffset + 3] = source[sourceOffset + 3]
    }
  }

  return target
}

export function resizeBilinear(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  assertRaster(source, sourceWidth, sourceHeight, targetWidth, targetHeight)
  const target = new Uint8ClampedArray(targetWidth * targetHeight * 4)
  const scaleX = sourceWidth / targetWidth
  const scaleY = sourceHeight / targetHeight

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(0, Math.min(sourceHeight - 1, (y + 0.5) * scaleY - 0.5))
    const y0 = Math.floor(sourceY)
    const y1 = Math.min(sourceHeight - 1, y0 + 1)
    const weightY = sourceY - y0

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(0, Math.min(sourceWidth - 1, (x + 0.5) * scaleX - 0.5))
      const x0 = Math.floor(sourceX)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const weightX = sourceX - x0
      const topLeft = (y0 * sourceWidth + x0) * 4
      const topRight = (y0 * sourceWidth + x1) * 4
      const bottomLeft = (y1 * sourceWidth + x0) * 4
      const bottomRight = (y1 * sourceWidth + x1) * 4
      const targetOffset = (y * targetWidth + x) * 4

      for (let channel = 0; channel < 4; channel += 1) {
        const top = source[topLeft + channel] * (1 - weightX) + source[topRight + channel] * weightX
        const bottom = source[bottomLeft + channel] * (1 - weightX) + source[bottomRight + channel] * weightX
        target[targetOffset + channel] = Math.round(top * (1 - weightY) + bottom * weightY)
      }
    }
  }

  return target
}

export const interpolationAlgorithms: Record<InterpolationMethod, InterpolationAlgorithm> = {
  nearest: {
    id: 'nearest',
    label: 'Ближайший сосед',
    description: 'Самый быстрый метод. Сохраняет жёсткие края и пиксельную структуру, но при увеличении создаёт ступеньки.',
    resize: resizeNearest,
  },
  bilinear: {
    id: 'bilinear',
    label: 'Билинейная',
    description: 'Смешивает четыре соседних пикселя. Даёт более плавный результат для фотографий и градиентов.',
    resize: resizeBilinear,
  },
}

export function resizePixels(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  method: InterpolationMethod = 'bilinear',
) {
  return interpolationAlgorithms[method].resize(source, sourceWidth, sourceHeight, targetWidth, targetHeight)
}

export function validateTargetSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return 'Ширина и высота должны быть целыми числами.'
  if (width < 1 || height < 1) return 'Минимальный размер — 1 × 1 пиксель.'
  if (width > MAX_RESIZE_SIDE || height > MAX_RESIZE_SIDE) return `Каждая сторона должна быть не больше ${MAX_RESIZE_SIDE.toLocaleString('ru-RU')} пикселей.`
  if (width * height > MAX_RESIZE_PIXELS) return 'Результат не должен превышать 4 миллиона пикселей.'
  return null
}

export function resizeImageDocument(
  document: ImageDocument,
  width: number,
  height: number,
  method: InterpolationMethod = 'bilinear',
): ImageDocument {
  const error = validateTargetSize(width, height)
  if (error) throw new Error(error)
  return {
    ...document,
    width,
    height,
    pixels: resizePixels(document.pixels, document.width, document.height, width, height, method),
  }
}
