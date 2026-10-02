import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check, ChevronDown, Download, Eye, EyeOff, FileImage, FolderOpen,
  ImageIcon, Info, Layers3, Maximize2, Minus, Pipette, Plus, RotateCcw,
  Scaling, SlidersHorizontal, X,
} from 'lucide-react'
import { LevelsDialog } from './components/LevelsDialog'
import { ResizeDialog } from './components/ResizeDialog'
import { decodeBrowserImage } from './lib/browser-image'
import {
  applyChannelVisibility, createChannelPreview, DEFAULT_CHANNELS,
  rgbToLab, visibleChannels, type ChannelKey, type ChannelState, type LabColor,
} from './lib/color'
import { decodeGb7, encodeGb7, type ImageDocument } from './lib/gb7'
import {
  interpolationAlgorithms, resizePixels, type InterpolationMethod,
} from './lib/resampling'

type ExportFormat = 'png' | 'jpg' | 'gb7'
type Notice = { kind: 'error' | 'success'; text: string }
type Tool = 'none' | 'pipette'
type PixelSample = {
  x: number
  y: number
  red: number
  green: number
  blue: number
  alpha: number
  lab: LabColor
}

const samples = [
  ['gradient-half-mask.gb7', 'Градиент 32 × 32'],
  ['vertical-kapibara.gb7', 'Капибара 1080 × 1920'],
  ['kapibara-mask.gb7', 'Капибара с маской 1200 × 1010'],
] as const

const channelLabels: Record<ChannelKey, { short: string; name: string }> = {
  gray: { short: 'Y', name: 'Яркость' },
  red: { short: 'R', name: 'Красный' },
  green: { short: 'G', name: 'Зелёный' },
  blue: { short: 'B', name: 'Синий' },
  alpha: { short: 'A', name: 'Альфа' },
}

function extension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function displayBytes(value: number) {
  if (value < 1024) return `${value} Б`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} КБ`
  return `${(value / 1024 / 1024).toFixed(1)} МБ`
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'image'
}

function ChannelThumbnail({ document, channel }: { document: ImageDocument; channel: ChannelKey }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const width = 72
    const height = 48
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.putImageData(createChannelPreview(document, channel, width, height), 0, 0)
  }, [channel, document])

  return <canvas ref={ref} className="channel-thumbnail" aria-hidden="true" />
}

function App() {
  const [document, setDocument] = useState<ImageDocument | null>(null)
  const [sourceSize, setSourceSize] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [viewInterpolation, setViewInterpolation] = useState<InterpolationMethod>('bilinear')
  const [fitMode, setFitMode] = useState(true)
  const [format, setFormat] = useState<ExportFormat>('gb7')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [sampleOpen, setSampleOpen] = useState(false)
  const [channels, setChannels] = useState<ChannelState>({ ...DEFAULT_CHANNELS })
  const [tool, setTool] = useState<Tool>('none')
  const [pixelSample, setPixelSample] = useState<PixelSample | null>(null)
  const [levelsOpen, setLevelsOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [levelsPreviewPixels, setLevelsPreviewPixels] = useState<Uint8ClampedArray | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const renderDocument = useMemo(() => {
    if (!document || !levelsPreviewPixels) return document
    return { ...document, pixels: levelsPreviewPixels }
  }, [document, levelsPreviewPixels])

  const displayedPixels = useMemo(
    () => renderDocument ? applyChannelVisibility(renderDocument, channels) : null,
    [channels, renderDocument],
  )

  const displaySize = useMemo(() => document ? {
    width: Math.max(1, Math.round(document.width * zoom / 100)),
    height: Math.max(1, Math.round(document.height * zoom / 100)),
  } : { width: 0, height: 0 }, [document, zoom])

  const scaledPixels = useMemo(() => {
    if (!document || !displayedPixels) return null
    return resizePixels(
      displayedPixels,
      document.width,
      document.height,
      displaySize.width,
      displaySize.height,
      viewInterpolation,
    )
  }, [displaySize.height, displaySize.width, displayedPixels, document, viewInterpolation])

  const activeChannels = document ? visibleChannels(document) : []
  const enabledChannelCount = activeChannels.filter((channel) => channels[channel]).length

  const fitImage = useCallback(() => {
    if (!document || !viewportRef.current) return
    const box = viewportRef.current.getBoundingClientRect()
    const availableWidth = Math.max(1, box.width - 100)
    const availableHeight = Math.max(1, box.height - 100)
    const fitted = Math.min(availableWidth / document.width, availableHeight / document.height) * 100
    setZoom(Math.min(300, Math.max(12, Math.floor(fitted))))
  }, [document])

  useEffect(() => {
    if (!document || !scaledPixels || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = displaySize.width
    canvas.height = displaySize.height
    canvas.getContext('2d')?.putImageData(
      new ImageData(new Uint8ClampedArray(scaledPixels), displaySize.width, displaySize.height), 0, 0,
    )
  }, [displaySize.height, displaySize.width, document, scaledPixels])

  useEffect(() => {
    if (!fitMode) return
    fitImage()
    const observer = new ResizeObserver(fitImage)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [fitImage, fitMode])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const openFile = useCallback(async (file: File) => {
    const ext = extension(file.name)
    if (!['png', 'jpg', 'jpeg', 'gb7'].includes(ext)) {
      setNotice({ kind: 'error', text: 'Поддерживаются только PNG, JPG и GB7.' })
      return
    }
    setBusy(true)
    try {
      const decoded = ext === 'gb7'
        ? decodeGb7(await file.arrayBuffer(), file.name)
        : await decodeBrowserImage(file)
      setDocument(decoded)
      setSourceSize(file.size)
      setFormat(ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext as ExportFormat)
      setChannels({ ...DEFAULT_CHANNELS })
      setPixelSample(null)
      setTool('none')
      setLevelsOpen(false)
      setResizeOpen(false)
      setLevelsPreviewPixels(null)
      setViewInterpolation('bilinear')
      setFitMode(true)
      setNotice({ kind: 'success', text: `${file.name} загружен` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Не удалось открыть изображение' })
    } finally {
      setBusy(false)
    }
  }, [])

  const loadSample = async (name: string) => {
    setSampleOpen(false)
    setBusy(true)
    try {
      const response = await fetch(`./samples/${name}`)
      if (!response.ok) throw new Error('Не удалось загрузить пример')
      const blob = await response.blob()
      await openFile(new File([blob], name, { type: 'application/octet-stream' }))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Не удалось загрузить пример' })
      setBusy(false)
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const exportImage = async () => {
    if (!document) return
    setBusy(true)
    try {
      if (format === 'gb7') {
        downloadBlob(new Blob([encodeGb7(document)], { type: 'application/octet-stream' }), `${baseName(document.name)}.gb7`)
      } else {
        const canvas = window.document.createElement('canvas')
        canvas.width = document.width
        canvas.height = document.height
        canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(document.pixels), document.width, document.height), 0, 0)
        const mime = format === 'png' ? 'image/png' : 'image/jpeg'
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92))
        if (!blob) throw new Error('Браузер не смог сформировать файл')
        downloadBlob(blob, `${baseName(document.name)}.${format}`)
      }
      setNotice({ kind: 'success', text: `Файл ${format.toUpperCase()} подготовлен` })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Ошибка экспорта' })
    } finally {
      setBusy(false)
    }
  }

  const changeZoom = (next: number) => {
    setFitMode(false)
    setZoom(Math.min(300, Math.max(12, Math.round(next))))
  }

  const toggleChannel = (channel: ChannelKey) => {
    setChannels((current) => ({ ...current, [channel]: !current[channel] }))
  }

  const previewLevels = useCallback((pixels: Uint8ClampedArray | null) => {
    setLevelsPreviewPixels(pixels)
  }, [])

  const applyLevelsResult = useCallback((pixels: Uint8ClampedArray) => {
    setDocument((current) => current ? { ...current, pixels: new Uint8ClampedArray(pixels) } : current)
    setLevelsPreviewPixels(null)
    setPixelSample(null)
    setNotice({ kind: 'success', text: 'Коррекция уровней применена' })
  }, [])

  const applyResizeResult = useCallback((next: ImageDocument, method: InterpolationMethod) => {
    setFitMode(false)
    setDocument(next)
    setViewInterpolation(method)
    setLevelsPreviewPixels(null)
    setPixelSample(null)
    setNotice({ kind: 'success', text: `Размер изменён: ${next.width} × ${next.height} px` })
  }, [])

  const samplePixel = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'pipette' || !document || event.button !== 0) return
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const displayX = (event.clientX - rect.left) * canvas.width / rect.width
    const displayY = (event.clientY - rect.top) * canvas.height / rect.height
    const x = Math.min(document.width - 1, Math.max(0, Math.floor(displayX * document.width / canvas.width)))
    const y = Math.min(document.height - 1, Math.max(0, Math.floor(displayY * document.height / canvas.height)))
    const offset = (y * document.width + x) * 4
    const red = document.pixels[offset]
    const green = document.pixels[offset + 1]
    const blue = document.pixels[offset + 2]
    setPixelSample({
      x,
      y,
      red,
      green,
      blue,
      alpha: document.pixels[offset + 3],
      lab: rgbToLab(red, green, blue),
    })
  }

  const reset = () => {
    setDocument(null)
    setSourceSize(0)
    setPixelSample(null)
    setTool('none')
    setLevelsOpen(false)
    setResizeOpen(false)
    setLevelsPreviewPixels(null)
    setChannels({ ...DEFAULT_CHANNELS })
    setNotice(null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="GrayBit Studio">
          <span className="brand-mark"><ImageIcon size={18} strokeWidth={2.2} /></span>
          <span>GrayBit <strong>Studio</strong></span>
        </div>

        <div className="top-actions">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg"
            onChange={(event) => event.target.files?.[0] && openFile(event.target.files[0])}
          />
          <button className="button primary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <FolderOpen size={17} /> Открыть
          </button>
          <div className="sample-menu">
            <button className="button secondary" onClick={() => setSampleOpen((value) => !value)} aria-expanded={sampleOpen}>
              Примеры <ChevronDown size={15} />
            </button>
            {sampleOpen && (
              <div className="menu-popover">
                {samples.map(([name, label]) => (
                  <button key={name} onClick={() => loadSample(name)}>{label}<small>{name}</small></button>
                ))}
              </div>
            )}
          </div>
          <span className="toolbar-separator" />
          <select aria-label="Формат скачивания" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} disabled={!document}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="gb7">GB7</option>
          </select>
          <button className="button accent" onClick={exportImage} disabled={!document || busy}>
            <Download size={17} /> Скачать
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="canvas-panel">
          <div className="document-bar">
            <div className="document-title">
              <FileImage size={16} />
              <span>{document?.name ?? 'Новый документ'}</span>
              {document && <span className="format-pill">{document.format}</span>}
            </div>
            <div className="document-tools">
              <button
                className="tool-button"
                onClick={() => setResizeOpen(true)}
                disabled={!document}
                title="Изменить размер изображения"
              >
                <Scaling size={16} /> <span>Размер</span>
              </button>
              <button
                className="tool-button"
                onClick={() => setLevelsOpen(true)}
                disabled={!document}
                title="Открыть градационную коррекцию"
              >
                <SlidersHorizontal size={16} /> <span>Уровни</span>
              </button>
              <button
                className={`tool-button ${tool === 'pipette' ? 'active' : ''}`}
                onClick={() => setTool((current) => current === 'pipette' ? 'none' : 'pipette')}
                disabled={!document}
                aria-pressed={tool === 'pipette'}
                title="Пипетка — считать цвет пикселя"
              >
                <Pipette size={16} /> <span>Пипетка</span>
              </button>
              {document && <button className="icon-button" onClick={reset} title="Закрыть изображение" aria-label="Закрыть изображение"><X size={17} /></button>}
            </div>
          </div>

          <div
            className={`canvas-viewport ${dragging ? 'is-dragging' : ''}`}
            ref={viewportRef}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              if (event.dataTransfer.files[0]) openFile(event.dataTransfer.files[0])
            }}
          >
            {document ? (
              <div className="canvas-stage" style={{ width: displaySize.width, height: displaySize.height }}>
                <canvas
                  ref={canvasRef}
                  className={tool === 'pipette' ? 'is-sampling' : ''}
                  width={displaySize.width}
                  height={displaySize.height}
                  aria-label={`Изображение ${document.name}`}
                  onClick={samplePixel}
                />
                {pixelSample && (
                  <span
                    className="sample-marker"
                    style={{
                      left: `${(pixelSample.x + 0.5) / document.width * 100}%`,
                      top: `${(pixelSample.y + 0.5) / document.height * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            ) : (
              <button className="empty-state" onClick={() => inputRef.current?.click()} disabled={busy}>
                <span className="empty-icon"><FileImage size={28} /></span>
                <strong>{busy ? 'Открываем изображение…' : 'Перетащите изображение сюда'}</strong>
                <span>или нажмите, чтобы выбрать PNG, JPG или GB7</span>
                <small>Файл обрабатывается локально в браузере</small>
              </button>
            )}
            {dragging && <div className="drop-overlay"><Download size={28} /><strong>Отпустите файл</strong></div>}
          </div>

          <div className="zoom-bar">
            <button className="icon-button" onClick={() => changeZoom(zoom - 10)} disabled={!document || zoom <= 12} title="Уменьшить"><Minus size={17} /></button>
            <span className="zoom-value">{zoom}%</span>
            <button className="icon-button" onClick={() => changeZoom(zoom + 10)} disabled={!document || zoom >= 300} title="Увеличить"><Plus size={17} /></button>
            <span className="toolbar-separator" />
            <button className={`text-button ${fitMode ? 'active' : ''}`} onClick={() => { setFitMode(true); fitImage() }} disabled={!document}><Maximize2 size={15} /> По размеру</button>
            <button className="text-button" onClick={() => changeZoom(100)} disabled={!document}><RotateCcw size={15} /> 100%</button>
          </div>
        </div>

        <aside className="inspector">
          <div className="inspector-heading">
            <Layers3 size={16} />
            <h2>Каналы</h2>
            {document && <span>{enabledChannelCount}/{activeChannels.length}</span>}
          </div>

          {document ? (
            <div className="channel-list">
              {activeChannels.map((channel) => {
                const label = channelLabels[channel]
                return (
                  <button
                    key={channel}
                    className={`channel-card ${channels[channel] ? 'enabled' : 'disabled'}`}
                    onClick={() => toggleChannel(channel)}
                    aria-pressed={channels[channel]}
                    aria-label={`${channels[channel] ? 'Выключить' : 'Включить'} канал ${label.name}`}
                  >
                    <ChannelThumbnail document={document} channel={channel} />
                    <span className={`channel-badge channel-${channel}`}>{label.short}</span>
                    <span className="channel-name">{label.name}</span>
                    <span className="channel-visibility">{channels[channel] ? <Eye size={16} /> : <EyeOff size={16} />}</span>
                  </button>
                )
              })}
              <p className="channel-hint">Кликните по каналу, чтобы изменить его отображение на холсте.</p>
            </div>
          ) : (
            <div className="inspector-empty">Откройте изображение, чтобы увидеть его цветовые каналы.</div>
          )}

          <section className={`picker-panel ${tool === 'pipette' ? 'active' : ''}`}>
            <div className="section-heading"><Pipette size={15} /><h3>Пипетка</h3></div>
            {!document ? (
              <p className="panel-placeholder">Инструмент станет доступен после загрузки изображения.</p>
            ) : !pixelSample ? (
              <p className="panel-placeholder">{tool === 'pipette' ? 'Кликните по изображению, чтобы считать цвет.' : 'Включите инструмент в верхней панели.'}</p>
            ) : (
              <div className="sample-details">
                <div className="sample-summary">
                  <span className="color-swatch" style={{ backgroundColor: `rgb(${pixelSample.red} ${pixelSample.green} ${pixelSample.blue})` }} />
                  <span><strong>X {pixelSample.x} · Y {pixelSample.y}</strong><small>координаты пикселя</small></span>
                </div>
                <div className="rgb-values">
                  <span className="value-red"><b>R</b>{pixelSample.red}</span>
                  <span className="value-green"><b>G</b>{pixelSample.green}</span>
                  <span className="value-blue"><b>B</b>{pixelSample.blue}</span>
                </div>
                <div className="lab-values">
                  <span>CIELAB</span>
                  <code>L* {pixelSample.lab.l.toFixed(1)}</code>
                  <code>a* {pixelSample.lab.a.toFixed(1)}</code>
                  <code>b* {pixelSample.lab.b.toFixed(1)}</code>
                </div>
              </div>
            )}
          </section>

          <section className="info-panel">
            <div className="section-heading"><Info size={15} /><h3>Сведения</h3></div>
            {document && (
              <>
                <div className="view-scale-control">
                  <label htmlFor="view-scale"><span>Масштаб просмотра</span><output htmlFor="view-scale">{zoom}%</output></label>
                  <input
                    id="view-scale"
                    type="range"
                    min="12"
                    max="300"
                    value={zoom}
                    onChange={(event) => changeZoom(Number(event.target.value))}
                  />
                  <label className="view-algorithm">
                    <span>Интерполяция</span>
                    <select value={viewInterpolation} onChange={(event) => setViewInterpolation(event.target.value as InterpolationMethod)}>
                      {Object.values(interpolationAlgorithms).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                </div>
                <dl className="metadata compact">
                  <div><dt>Размер</dt><dd>{document.width} × {document.height} px</dd></div>
                  <div><dt>На холсте</dt><dd>{displaySize.width} × {displaySize.height} px</dd></div>
                  <div><dt>Глубина</dt><dd>{document.colorDepth} бит</dd></div>
                  <div><dt>Формат</dt><dd>{document.format}</dd></div>
                  <div><dt>Маска</dt><dd className={document.hasMask ? 'has-mask' : ''}>{document.hasMask ? <><Check size={14} /> Есть</> : 'Нет'}</dd></div>
                  <div><dt>Файл</dt><dd>{displayBytes(sourceSize)}</dd></div>
                </dl>
              </>
            )}
          </section>
        </aside>
      </section>

      <footer className="statusbar">
        <span className={`status-indicator ${document ? 'ready' : ''}`} />
        <span>{document ? (tool === 'pipette' ? 'Пипетка активна' : 'Готово') : 'Нет открытого файла'}</span>
        {pixelSample && <><span className="status-separator" /><span>X {pixelSample.x} · Y {pixelSample.y}</span></>}
        {document && <>
          <span className="status-separator" />
          <span>{document.width} × {document.height} px</span>
          <span className="status-separator" />
          <span>{document.colorDepth} бит</span>
          <span className="status-spacer" />
          <span>{document.format}{document.hasMask ? ' · маска' : ''}</span>
        </>}
      </footer>

      <LevelsDialog
        document={document}
        open={levelsOpen}
        onPreview={previewLevels}
        onApply={applyLevelsResult}
        onClose={() => { setLevelsOpen(false); setLevelsPreviewPixels(null) }}
      />

      <ResizeDialog
        document={document}
        open={resizeOpen}
        onApply={applyResizeResult}
        onClose={() => setResizeOpen(false)}
      />

      {notice && (
        <div className={`toast ${notice.kind}`} role="status">
          {notice.kind === 'success' ? <Check size={17} /> : <Info size={17} />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Закрыть уведомление"><X size={15} /></button>
        </div>
      )}
    </main>
  )
}

export default App
