import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check, ChevronDown, Download, FileImage, FolderOpen, ImageIcon,
  Info, Maximize2, Minus, Plus, RotateCcw, X,
} from 'lucide-react'
import { decodeBrowserImage } from './lib/browser-image'
import { decodeGb7, encodeGb7, type ImageDocument } from './lib/gb7'

type ExportFormat = 'png' | 'jpg' | 'gb7'
type Notice = { kind: 'error' | 'success'; text: string }

const samples = [
  ['gradient-half-mask.gb7', 'Градиент 32 × 32'],
  ['vertical-kapibara.gb7', 'Капибара 1080 × 1920'],
  ['kapibara-mask.gb7', 'Капибара с маской 1200 × 1010'],
] as const

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

function App() {
  const [document, setDocument] = useState<ImageDocument | null>(null)
  const [sourceSize, setSourceSize] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [fitMode, setFitMode] = useState(true)
  const [format, setFormat] = useState<ExportFormat>('gb7')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [sampleOpen, setSampleOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const fitImage = useCallback(() => {
    if (!document || !viewportRef.current) return
    const box = viewportRef.current.getBoundingClientRect()
    const availableWidth = Math.max(120, box.width - 72)
    const availableHeight = Math.max(120, box.height - 72)
    setZoom(Math.min(1, availableWidth / document.width, availableHeight / document.height))
  }, [document])

  useEffect(() => {
    if (!document || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = document.width
    canvas.height = document.height
    canvas.getContext('2d')?.putImageData(
      new ImageData(new Uint8ClampedArray(document.pixels), document.width, document.height), 0, 0,
    )
  }, [document])

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
        const canvas = canvasRef.current
        if (!canvas) throw new Error('Холст недоступен')
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
    setZoom(Math.min(4, Math.max(0.05, next)))
  }

  const reset = () => {
    setDocument(null)
    setSourceSize(0)
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
            {document && <button className="icon-button" onClick={reset} title="Закрыть изображение" aria-label="Закрыть изображение"><X size={17} /></button>}
          </div>

          <div
            className={`canvas-viewport ${dragging ? 'is-dragging' : ''}`}
            ref={viewportRef}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              if (event.dataTransfer.files[0]) openFile(event.dataTransfer.files[0])
            }}
          >
            {document ? (
              <div className="canvas-stage" style={{ width: document.width * zoom, height: document.height * zoom }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: document.width * zoom, height: document.height * zoom }}
                  aria-label={`Изображение ${document.name}`}
                />
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
            <button className="icon-button" onClick={() => changeZoom(zoom / 1.25)} disabled={!document} title="Уменьшить"><Minus size={17} /></button>
            <span className="zoom-value">{Math.round(zoom * 100)}%</span>
            <button className="icon-button" onClick={() => changeZoom(zoom * 1.25)} disabled={!document} title="Увеличить"><Plus size={17} /></button>
            <span className="toolbar-separator" />
            <button className={`text-button ${fitMode ? 'active' : ''}`} onClick={() => { setFitMode(true); fitImage() }} disabled={!document}><Maximize2 size={15} /> По размеру</button>
            <button className="text-button" onClick={() => changeZoom(1)} disabled={!document}><RotateCcw size={15} /> 100%</button>
          </div>
        </div>

        <aside className="inspector">
          <div className="inspector-heading"><Info size={16} /><h2>Сведения</h2></div>
          {document ? (
            <dl className="metadata">
              <div><dt>Размер</dt><dd>{document.width} × {document.height} px</dd></div>
              <div><dt>Глубина цвета</dt><dd>{document.colorDepth} бит</dd></div>
              <div><dt>Формат</dt><dd>{document.format}</dd></div>
              <div><dt>Маска</dt><dd className={document.hasMask ? 'has-mask' : ''}>{document.hasMask ? <><Check size={14} /> Есть</> : 'Нет'}</dd></div>
              <div><dt>Размер файла</dt><dd>{displayBytes(sourceSize)}</dd></div>
            </dl>
          ) : (
            <div className="inspector-empty">Откройте изображение, чтобы увидеть его параметры.</div>
          )}
          <div className="format-note">
            <strong>GrayBit-7</strong>
            <p>7 бит на яркость пикселя. Старший бит хранит двоичную маску прозрачности.</p>
          </div>
        </aside>
      </section>

      <footer className="statusbar">
        <span className={`status-indicator ${document ? 'ready' : ''}`} />
        <span>{document ? 'Готово' : 'Нет открытого файла'}</span>
        {document && <>
          <span className="status-separator" />
          <span>{document.width} × {document.height} px</span>
          <span className="status-separator" />
          <span>{document.colorDepth} бит</span>
          <span className="status-spacer" />
          <span>{document.format}{document.hasMask ? ' · маска' : ''}</span>
        </>}
      </footer>

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
