import { describe, expect, it } from 'vitest'
import { applyConvolution, applyMedianFilter, IDENTITY_KERNEL, KERNEL_PRESETS, kernelDivisor } from './convolution'

describe('convolution filters', () => {
  it('keeps pixels unchanged for the identity kernel without mutating the source', () => {
    const source = new Uint8ClampedArray([12, 34, 56, 78, 90, 120, 150, 180])
    const result = applyConvolution({
      pixels: source,
      width: 2,
      height: 1,
      kernel: IDENTITY_KERNEL,
      channels: ['red', 'green', 'blue', 'alpha'],
      edgeMode: 'copy',
    })
    expect(result).not.toBe(source)
    expect(Array.from(result)).toEqual(Array.from(source))
  })

  it('normalizes blur kernels by their sum', () => {
    const box = KERNEL_PRESETS.find((preset) => preset.id === 'box-blur')!
    const gaussian = KERNEL_PRESETS.find((preset) => preset.id === 'gaussian')!
    expect(kernelDivisor(box.kernel)).toBe(9)
    expect(kernelDivisor(gaussian.kernel)).toBe(16)
    expect(kernelDivisor(KERNEL_PRESETS.find((preset) => preset.id === 'prewitt-x')!.kernel)).toBe(1)
  })

  it('supports black, white and copied edge padding without changing dimensions', () => {
    const source = new Uint8ClampedArray([90, 45, 0, 255])
    const kernel = new Array(9).fill(1)
    const run = (edgeMode: 'black' | 'white' | 'copy') => applyConvolution({
      pixels: source, width: 1, height: 1, kernel, channels: ['red', 'green', 'blue'], edgeMode,
    })
    expect(Array.from(run('black'))).toEqual([10, 5, 0, 255])
    expect(Array.from(run('white'))).toEqual([237, 232, 227, 255])
    expect(Array.from(run('copy'))).toEqual([90, 45, 0, 255])
  })

  it('filters only selected channels', () => {
    const source = new Uint8ClampedArray([10, 20, 30, 40])
    const result = applyConvolution({
      pixels: source,
      width: 1,
      height: 1,
      kernel: new Array(9).fill(1),
      channels: ['green'],
      edgeMode: 'black',
    })
    expect(Array.from(result)).toEqual([10, 2, 30, 40])
  })

  it('maps the grayscale channel to all three color components', () => {
    const source = new Uint8ClampedArray([90, 90, 90, 255])
    const result = applyConvolution({
      pixels: source,
      width: 1,
      height: 1,
      kernel: new Array(9).fill(1),
      channels: ['gray'],
      edgeMode: 'black',
    })
    expect(Array.from(result)).toEqual([10, 10, 10, 255])
  })

  it('uses absolute values for directional edge presets', () => {
    const source = new Uint8ClampedArray([
      255, 255, 255, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 0, 0, 0, 255,
    ])
    const preset = KERNEL_PRESETS.find((item) => item.id === 'prewitt-x')!
    const result = applyConvolution({
      pixels: source, width: 2, height: 3, kernel: preset.kernel,
      channels: ['gray'], edgeMode: 'copy', absolute: preset.absolute,
    })
    expect(result[0]).toBe(255)
    expect(result.length).toBe(source.length)
  })

  it('removes isolated impulse noise with the median filter', () => {
    const values = [10, 10, 10, 10, 255, 10, 10, 10, 10]
    const source = new Uint8ClampedArray(values.flatMap((value) => [value, value, value, 255]))
    const result = applyMedianFilter({
      pixels: source,
      width: 3,
      height: 3,
      kernel: new Array(9).fill(1),
      channels: ['gray'],
      edgeMode: 'copy',
    })
    const center = (1 * 3 + 1) * 4
    expect(Array.from(result.slice(center, center + 4))).toEqual([10, 10, 10, 255])
  })
})
