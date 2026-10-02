import { applyImageFilter, type ImageFilterOptions } from '../lib/convolution'

export type ConvolutionWorkerRequest = ImageFilterOptions & { id: number }
export type ConvolutionWorkerResponse = {
  id: number
  pixels?: Uint8ClampedArray
  error?: string
}

type WorkerContext = {
  onmessage: ((event: MessageEvent<ConvolutionWorkerRequest>) => void) | null
  postMessage: (message: ConvolutionWorkerResponse, transfer?: Transferable[]) => void
}

const workerContext = self as unknown as WorkerContext

workerContext.onmessage = (event) => {
  try {
    const { id, ...options } = event.data
    const pixels = applyImageFilter(options)
    workerContext.postMessage({ id, pixels }, [pixels.buffer])
  } catch (error) {
    workerContext.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : 'Не удалось применить фильтр',
    })
  }
}

export {}
