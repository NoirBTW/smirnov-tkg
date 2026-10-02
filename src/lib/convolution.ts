import type { ChannelKey } from './color'

export type EdgeMode = 'copy' | 'black' | 'white'
export type FilterOperation = 'convolution' | 'median'
export type KernelPresetId = 'identity' | 'sharpen' | 'gaussian' | 'box-blur' | 'median' | 'prewitt-x' | 'prewitt-y'

export type KernelPreset = {
  id: KernelPresetId
  label: string
  kernel: readonly number[]
  absolute?: boolean
  operation?: FilterOperation
}

export type ConvolutionOptions = {
  pixels: Uint8ClampedArray
  width: number
  height: number
  kernel: readonly number[]
  channels: readonly ChannelKey[]
  edgeMode: EdgeMode
  absolute?: boolean
}

export type ImageFilterOptions = ConvolutionOptions & {
  operation?: FilterOperation
}

export const KERNEL_PRESETS: readonly KernelPreset[] = [
  {
    id: 'identity',
    label: 'Тождественное отображение',
    kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  },
  {
    id: 'sharpen',
    label: 'Повышение резкости',
    kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  },
  {
    id: 'gaussian',
    label: 'Размытие по Гауссу 3 × 3',
    kernel: [1, 2, 1, 2, 4, 2, 1, 2, 1],
  },
  {
    id: 'box-blur',
    label: 'Прямоугольное размытие',
    kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  {
    id: 'median',
    label: 'Медианный фильтр 3 × 3',
    kernel: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    operation: 'median',
  },
  {
    id: 'prewitt-x',
    label: 'Оператор Прюитта X',
    kernel: [-1, 0, 1, -1, 0, 1, -1, 0, 1],
    absolute: true,
  },
  {
    id: 'prewitt-y',
    label: 'Оператор Прюитта Y',
    kernel: [-1, -1, -1, 0, 0, 0, 1, 1, 1],
    absolute: true,
  },
] as const

export const IDENTITY_KERNEL = KERNEL_PRESETS[0].kernel

export function kernelDivisor(kernel: readonly number[]) {
  const sum = kernel.reduce((total, value) => total + value, 0)
  return Math.abs(sum) < Number.EPSILON ? 1 : sum
}

function channelIndexes(channels: readonly ChannelKey[]) {
  const result = new Set<number>()
  for (const channel of channels) {
    if (channel === 'gray') {
      result.add(0)
      result.add(1)
      result.add(2)
    } else if (channel === 'red') result.add(0)
    else if (channel === 'green') result.add(1)
    else if (channel === 'blue') result.add(2)
    else result.add(3)
  }
  return result
}

function paddedValue(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
  edgeMode: EdgeMode,
) {
  if (x >= 0 && y >= 0 && x < width && y < height) {
    return pixels[(y * width + x) * 4 + channel]
  }
  if (edgeMode === 'black') return channel === 3 ? 255 : 0
  if (edgeMode === 'white') return 255
  const copiedX = Math.min(width - 1, Math.max(0, x))
  const copiedY = Math.min(height - 1, Math.max(0, y))
  return pixels[(copiedY * width + copiedX) * 4 + channel]
}

function validateOptions({ pixels, width, height, kernel }: ConvolutionOptions) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Ширина и высота изображения должны быть положительными целыми числами')
  }
  if (pixels.length !== width * height * 4) {
    throw new Error('Размер массива пикселей не соответствует изображению')
  }
  if (kernel.length !== 9 || kernel.some((value) => !Number.isFinite(value))) {
    throw new Error('Ядро должно содержать девять конечных чисел')
  }
}

export function applyConvolution({
  pixels,
  width,
  height,
  kernel,
  channels,
  edgeMode,
  absolute = false,
}: ConvolutionOptions) {
  validateOptions({ pixels, width, height, kernel, channels, edgeMode, absolute })

  const filteredChannels = channelIndexes(channels)
  const output = new Uint8ClampedArray(pixels)
  if (filteredChannels.size === 0) return output
  const divisor = kernelDivisor(kernel)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputOffset = (y * width + x) * 4
      for (const channel of filteredChannels) {
        let sum = 0
        for (let kernelY = 0; kernelY < 3; kernelY += 1) {
          for (let kernelX = 0; kernelX < 3; kernelX += 1) {
            const weight = kernel[kernelY * 3 + kernelX]
            sum += paddedValue(
              pixels,
              width,
              height,
              x + kernelX - 1,
              y + kernelY - 1,
              channel,
              edgeMode,
            ) * weight
          }
        }
        const normalized = sum / divisor
        output[outputOffset + channel] = absolute ? Math.abs(normalized) : normalized
      }
    }
  }

  return output
}

export function applyMedianFilter({
  pixels,
  width,
  height,
  kernel,
  channels,
  edgeMode,
}: ConvolutionOptions) {
  validateOptions({ pixels, width, height, kernel, channels, edgeMode })
  const filteredChannels = channelIndexes(channels)
  const output = new Uint8ClampedArray(pixels)
  if (filteredChannels.size === 0) return output

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputOffset = (y * width + x) * 4
      for (const channel of filteredChannels) {
        const neighborhood: number[] = []
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            neighborhood.push(paddedValue(pixels, width, height, x + offsetX, y + offsetY, channel, edgeMode))
          }
        }
        neighborhood.sort((left, right) => left - right)
        output[outputOffset + channel] = neighborhood[4]
      }
    }
  }

  return output
}

export function applyImageFilter(options: ImageFilterOptions) {
  return options.operation === 'median' ? applyMedianFilter(options) : applyConvolution(options)
}
