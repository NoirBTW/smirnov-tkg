import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Grid3X3, RotateCcw, X } from 'lucide-react'
import { visibleChannels, type ChannelKey } from '../lib/color'
import {
  IDENTITY_KERNEL,
  KERNEL_PRESETS,
  kernelDivisor,
  type EdgeMode,
  type FilterOperation,
  type KernelPresetId,
} from '../lib/convolution'
import type { ImageDocument } from '../lib/gb7'
import type { ConvolutionWorkerRequest, ConvolutionWorkerResponse } from '../workers/convolution.worker'

type FilterDialogProps = {
  document: ImageDocument | null
  open: boolean
  onPreview: (pixels: Uint8ClampedArray | null) => void
  onApply: (pixels: Uint8ClampedArray) => void
  onClose: () => void
}

type PresetSelection = KernelPresetId | 'custom'
type WorkerMode = 'preview' | 'apply'

const channelLabels: Record<ChannelKey, string> = {
  gray: 'Gray',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  alpha: 'Alpha',
}

const edgeLabels: Record<EdgeMode, string> = {
  copy: 'Копирование края',
  black: 'Заполнение чёрным',
  white: 'Заполнение белым',
}

export function FilterDialog({ document, open, onPreview, onApply, onClose }: FilterDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [preset, setPreset] = useState<PresetSelection>('identity')
  const [kernelFields, setKernelFields] = useState(() => IDENTITY_KERNEL.map(String))
  const [absolute, setAbsolute] = useState(false)
  const [operation, setOperation] = useState<FilterOperation>('convolution')
  const [selectedChannels, setSelectedChannels] = useState<ChannelKey[]>([])
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('copy')
  const [preview, setPreview] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<Uint8ClampedArray | null>(null)
  const [resultKey, setResultKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const availableChannels = useMemo(() => document ? visibleChannels(document) : [], [document])
  const parsedKernel = useMemo(
    () => kernelFields.map((field) => field.trim() === '' ? Number.NaN : Number(field.replace(',', '.'))),
    [kernelFields],
  )
  const kernelError = operation === 'convolution' && parsedKernel.some((value) => !Number.isFinite(value))
    ? 'Заполните все девять коэффициентов числами.'
    : operation === 'convolution' && parsedKernel.some((value) => Math.abs(value) > 1000)
      ? 'Коэффициенты должны быть в диапазоне от −1000 до 1000.'
      : selectedChannels.length === 0
        ? 'Выберите хотя бы один канал.'
        : null
  const settingsKey = useMemo(
    () => JSON.stringify([operation, parsedKernel, selectedChannels, edgeMode, absolute]),
    [absolute, edgeMode, operation, parsedKernel, selectedChannels],
  )

  const stopWorker = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setProcessing(false)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && document) {
      setPreset('identity')
      setKernelFields(IDENTITY_KERNEL.map(String))
      setAbsolute(false)
      setOperation('convolution')
      setSelectedChannels(visibleChannels(document))
      setEdgeMode('copy')
      setPreview(true)
      setResult(null)
      setResultKey('')
      setError(null)
      if (dialog && !dialog.open) dialog.showModal()
    } else if (dialog?.open) {
      dialog.close()
    }
  }, [document, open])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const runWorker = useCallback((mode: WorkerMode) => {
    if (!document || kernelError) return
    stopWorker()
    setProcessing(true)
    setError(null)
    const worker = new Worker(new URL('../workers/convolution.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const id = ++requestIdRef.current
    const pixels = new Uint8ClampedArray(document.pixels)
    const request: ConvolutionWorkerRequest = {
      id,
      pixels,
      width: document.width,
      height: document.height,
      kernel: parsedKernel,
      channels: selectedChannels,
      edgeMode,
      absolute,
      operation,
    }

    worker.onmessage = (event: MessageEvent<ConvolutionWorkerResponse>) => {
      if (event.data.id !== requestIdRef.current) return
      workerRef.current = null
      worker.terminate()
      setProcessing(false)
      if (event.data.error || !event.data.pixels) {
        setError(event.data.error ?? 'Не удалось получить результат фильтрации')
        onPreview(null)
        return
      }
      const nextPixels = new Uint8ClampedArray(event.data.pixels)
      if (mode === 'apply') {
        onApply(nextPixels)
        onPreview(null)
        onClose()
      } else {
        setResult(nextPixels)
        setResultKey(settingsKey)
        onPreview(nextPixels)
      }
    }
    worker.onerror = () => {
      if (id !== requestIdRef.current) return
      workerRef.current = null
      worker.terminate()
      setProcessing(false)
      setError('Web Worker завершился с ошибкой')
      onPreview(null)
    }
    worker.postMessage(request, [pixels.buffer])
  }, [absolute, document, edgeMode, kernelError, onApply, onClose, onPreview, operation, parsedKernel, selectedChannels, settingsKey, stopWorker])

  useEffect(() => {
    if (!open || !document || !preview || kernelError) {
      stopWorker()
      onPreview(null)
      return
    }
    stopWorker()
    setProcessing(true)
    const timer = window.setTimeout(() => runWorker('preview'), 140)
    return () => {
      window.clearTimeout(timer)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [document, kernelError, onPreview, open, preview, runWorker, stopWorker])

  const selectPreset = (id: KernelPresetId) => {
    const next = KERNEL_PRESETS.find((item) => item.id === id)
    if (!next) return
    setPreset(id)
    setKernelFields(next.kernel.map(String))
    setAbsolute(Boolean(next.absolute))
    setOperation(next.operation ?? 'convolution')
    setError(null)
  }

  const updateKernelField = (index: number, value: string) => {
    setPreset('custom')
    setOperation('convolution')
    setKernelFields((current) => current.map((field, fieldIndex) => fieldIndex === index ? value : field))
  }

  const toggleChannel = (channel: ChannelKey) => {
    setSelectedChannels((current) => current.includes(channel)
      ? current.filter((item) => item !== channel)
      : [...current, channel])
  }

  const reset = () => {
    setPreset('identity')
    setKernelFields(IDENTITY_KERNEL.map(String))
    setAbsolute(false)
    setOperation('convolution')
    setSelectedChannels(availableChannels)
    setEdgeMode('copy')
    setError(null)
  }

  const cancel = () => {
    stopWorker()
    onPreview(null)
    onClose()
  }

  const apply = () => {
    if (kernelError) return
    if (preview && result && resultKey === settingsKey && !processing) {
      onApply(new Uint8ClampedArray(result))
      onPreview(null)
      onClose()
      return
    }
    runWorker('apply')
  }

  if (!document) return <dialog ref={dialogRef} className="filter-dialog" />

  const divisor = kernelError || operation === 'median' ? null : kernelDivisor(parsedKernel)

  return (
    <dialog
      ref={dialogRef}
      className="filter-dialog"
      aria-labelledby="filter-title"
      onCancel={(event) => { event.preventDefault(); cancel() }}
    >
      <div className="filter-dialog-shell">
        <header className="levels-header">
          <span className="levels-title-icon"><Grid3X3 size={18} /></span>
          <div>
            <h2 id="filter-title">Свёртка изображения</h2>
            <p>Фильтр с настраиваемым ядром 3 × 3</p>
          </div>
          <button type="button" className="icon-button" onClick={cancel} aria-label="Закрыть фильтр"><X size={17} /></button>
        </header>

        <div className="filter-body">
          <div className="filter-toolbar">
            <label className="field filter-preset">
              <span>Предустановка</span>
              <select value={preset} onChange={(event) => selectPreset(event.target.value as KernelPresetId)}>
                {preset === 'custom' && <option value="custom" disabled>Пользовательское ядро</option>}
                {KERNEL_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>

            <label className="field edge-field">
              <span>Обработка края</span>
              <select value={edgeMode} onChange={(event) => setEdgeMode(event.target.value as EdgeMode)}>
                {(Object.keys(edgeLabels) as EdgeMode[]).map((mode) => <option key={mode} value={mode}>{edgeLabels[mode]}</option>)}
              </select>
            </label>
          </div>

          <section className="kernel-section" aria-labelledby="kernel-heading">
            <div className="kernel-heading">
              <div>
                <h3 id="kernel-heading">Ядро</h3>
                <p>{operation === 'median' ? 'Берётся центральное значение отсортированной окрестности' : 'Сумма автоматически используется как делитель'}</p>
              </div>
              <span>{operation === 'median' ? 'Операция: медиана' : <>Делитель: {divisor ?? '—'}{absolute ? ' · модуль' : ''}</>}</span>
            </div>
            <div className="kernel-grid">
              {kernelFields.map((value, index) => (
                <input
                  key={index}
                  type="number"
                  min="-1000"
                  max="1000"
                  step="0.1"
                  value={value}
                  disabled={operation === 'median'}
                  aria-label={`Коэффициент ядра, строка ${Math.floor(index / 3) + 1}, столбец ${index % 3 + 1}`}
                  onChange={(event) => updateKernelField(index, event.target.value)}
                />
              ))}
            </div>
          </section>

          <fieldset className="channel-fieldset">
            <legend>Каналы</legend>
            <div>
              {availableChannels.map((channel) => (
                <label key={channel}>
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(channel)}
                    onChange={() => toggleChannel(channel)}
                  />
                  <span>{channelLabels[channel]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={`filter-state ${kernelError || error ? 'error' : ''}`} role="status">
            {kernelError ?? error ?? (processing ? 'Обработка изображения в Web Worker…' : preview ? 'Предпросмотр применён к холсту.' : 'Предпросмотр выключен.')}
          </div>
        </div>

        <footer className="levels-footer filter-footer">
          <label className="preview-check">
            <input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} />
            <span>Предпросмотр</span>
          </label>
          <div className="levels-actions">
            <button type="button" className="button secondary reset-button" onClick={reset}><RotateCcw size={15} /> Сбросить</button>
            <button type="button" className="button secondary" onClick={cancel}>Отмена</button>
            <button type="button" className="button primary" onClick={apply} disabled={Boolean(kernelError || error || processing)}>Применить</button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
