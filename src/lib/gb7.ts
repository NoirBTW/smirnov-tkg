export const GB7_HEADER_SIZE = 12
export const GB7_SIGNATURE = new Uint8Array([0x47, 0x42, 0x37, 0x1d])

export type ImageDocument = {
  name: string
  format: 'PNG' | 'JPEG' | 'GB7'
  width: number
  height: number
  colorDepth: number
  hasMask: boolean
  channelMode: 'gray' | 'gray-alpha' | 'rgb' | 'rgba'
  pixels: Uint8ClampedArray
}

function fail(message: string): never {
  throw new Error(`Некорректный GB7: ${message}`)
}

export function decodeGb7(buffer: ArrayBuffer, name = 'image.gb7'): ImageDocument {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < GB7_HEADER_SIZE) fail('файл короче 12-байтового заголовка')

  if (!GB7_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    fail('неверная сигнатура файла')
  }
  if (bytes[4] !== 0x01) fail(`версия ${bytes[4]} не поддерживается`)
  if ((bytes[5] & 0xfe) !== 0) fail('в поле флагов установлены зарезервированные биты')
  if (bytes[10] !== 0 || bytes[11] !== 0) fail('зарезервированное поле должно быть нулевым')

  const view = new DataView(buffer)
  const width = view.getUint16(6, false)
  const height = view.getUint16(8, false)
  const hasMask = (bytes[5] & 1) === 1
  if (width === 0 || height === 0) fail('ширина и высота должны быть больше нуля')

  const expectedLength = GB7_HEADER_SIZE + width * height
  if (bytes.length !== expectedLength) {
    fail(`ожидалось ${expectedLength} байт, получено ${bytes.length}`)
  }

  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const packed = bytes[GB7_HEADER_SIZE + index]
    const gray = Math.round((packed & 0x7f) * 255 / 127)
    const target = index * 4
    pixels[target] = gray
    pixels[target + 1] = gray
    pixels[target + 2] = gray
    pixels[target + 3] = hasMask && (packed & 0x80) === 0 ? 0 : 255
  }

  return {
    name,
    format: 'GB7',
    width,
    height,
    colorDepth: hasMask ? 8 : 7,
    hasMask,
    channelMode: hasMask ? 'gray-alpha' : 'gray',
    pixels,
  }
}

export function encodeGb7(document: ImageDocument): ArrayBuffer {
  const { width, height, pixels } = document
  if (width < 1 || height < 1 || width > 0xffff || height > 0xffff) {
    throw new Error('GB7 поддерживает размеры от 1 до 65 535 пикселей по каждой стороне')
  }

  const hasMask = document.hasMask || pixels.some((value, index) => index % 4 === 3 && value < 255)
  const buffer = new ArrayBuffer(GB7_HEADER_SIZE + width * height)
  const bytes = new Uint8Array(buffer)
  bytes.set(GB7_SIGNATURE, 0)
  bytes[4] = 0x01
  bytes[5] = hasMask ? 0x01 : 0x00

  const view = new DataView(buffer)
  view.setUint16(6, width, false)
  view.setUint16(8, height, false)
  view.setUint16(10, 0, false)

  for (let index = 0; index < width * height; index += 1) {
    const source = index * 4
    const luminance = 0.2126 * pixels[source] + 0.7152 * pixels[source + 1] + 0.0722 * pixels[source + 2]
    const gray7 = Math.round(luminance * 127 / 255) & 0x7f
    const mask = hasMask && pixels[source + 3] >= 128 ? 0x80 : 0
    bytes[GB7_HEADER_SIZE + index] = gray7 | mask
  }

  return buffer
}
