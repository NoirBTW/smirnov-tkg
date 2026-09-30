import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, RotateCcw, X } from 'lucide-react'
import type { ImageDocument } from '../lib/gb7'
import {
  applyLevels, buildHistogram, createDefaultLevels, gammaToPosition,
  levelDomainMax, levelsChannels, positionToGamma,
  type Histogram, type LevelSettings, type LevelsChannel, type LevelsSettings,
} from '../lib/levels'

type HistogramScale = 'linear' | 'logarithmic'

type LevelsDialogProps = {
  document: ImageDocument | null
  open: boolean
  onPreview: (pixels: Uint8ClampedArray | null) => void
  onApply: (pixels: Uint8ClampedArray) => void
  onClose: () => void
}

const channelLabels: Record<LevelsChannel, string> = {
  master: 'Master — все каналы',
  gray: 'Gray — яркость',
  red: 'Red — красный',
  green: 'Green — зелёный',
  blue: 'Blue — синий',
  alpha: 'Alpha — прозрачность',
}

const histogramColors: Record<LevelsChannel, string> = {
  master: '#d9dee7',
  gray: '#c9cfd9',
  red: '#ef6e78',
  green: '#65d69f',
  blue: '#6ea8ff',
  alpha: '#b8c0cd',
}

function HistogramCanvas({ histogram, scale, channel }: {
  histogram: Histogram
  scale: HistogramScale
  channel: LevelsChannel
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const width = canvas.width
    const height = canvas.height
    const left = 14
    const right = width - 14
    const top = 10
    const bottom = height - 28
    const chartWidth = right - left
    const chartHeight = bottom - top
    const values = Array.from(histogram.bins, (count) => scale === 'logarithmic' ? Math.log1p(count) : count)
    const maximum = Math.max(1, ...values)

    context.clearRect(0, 0, width, height)
    context.fillStyle = '#101319'
    context.fillRect(0, 0, width, height)

    context.strokeStyle = '#252b34'
    context.lineWidth = 1
    for (let row = 0; row <= 4; row += 1) {
      const y = top + chartHeight * row / 4 + 0.5
      context.beginPath()
      context.moveTo(left, y)
      context.lineTo(right, y)
      context.stroke()
    }

    context.fillStyle = histogramColors[channel]
    const barWidth = chartWidth / values.length
    values.forEach((value, index) => {
      const barHeight = Math.max(value > 0 ? 1 : 0, value / maximum * chartHeight)
      const x = left + index * barWidth
      context.fillRect(x, bottom - barHeight, Math.max(1, barWidth), barHeight)
    })

    context.strokeStyle = '#596372'
    context.beginPath()
    context.moveTo(left, bottom + 0.5)
    context.lineTo(right, bottom + 0.5)
    context.stroke()

    context.fillStyle = '#8f98a6'
    context.font = '12px Manrope, system-ui, sans-serif'
    context.textBaseline = 'bottom'
    context.fillText('0', left, height - 4)
    const label = String(histogram.domainMax)
    const labelWidth = context.measureText(label).width
    context.fillText(label, right - labelWidth, height - 4)
  }, [channel, histogram, scale])

  return (
    <canvas
      ref={ref}
      className="histogram-canvas"
      width={720}
      height={216}
      role="img"
      aria-label={`Гистограмма канала ${channelLabels[channel]}, диапазон от 0 до ${histogram.domainMax}`}
    />
  )
}

type Marker = 'black' | 'gamma' | 'white'

function LevelsTrack({ value, maximum, onChange }: {
  value: LevelSettings
  maximum: number
  onChange: (next: LevelSettings) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<Marker | null>(null)
  const gammaPosition = gammaToPosition(value)

  const moveMarker = (marker: Marker, rawValue: number) => {
    const position = Math.min(maximum, Math.max(0, rawValue))
    if (marker === 'black') {
      onChange({ ...value, black: Math.min(value.white - 1, Math.round(position)) })
    } else if (marker === 'white') {
      onChange({ ...value, white: Math.max(value.black + 1, Math.round(position)) })
    } else {
      const constrained = Math.min(value.white, Math.max(value.black, position))
      onChange({ ...value, gamma: positionToGamma(constrained, value.black, value.white) })
    }
  }

  const valueFromPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return 0
    return (clientX - rect.left) / rect.width * maximum
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const position = valueFromPointer(event.clientX)
    const candidates: Array<[Marker, number]> = [
      ['black', Math.abs(position - value.black)],
      ['gamma', Math.abs(position - gammaPosition)],
      ['white', Math.abs(position - value.white)],
    ]
    candidates.sort((left, right) => left[1] - right[1])
    const marker = candidates[0][0]
    setActive(marker)
    event.currentTarget.setPointerCapture(event.pointerId)
    moveMarker(marker, position)
  }

  const handleKey = (marker: Marker, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const position = marker === 'black' ? value.black : marker === 'white' ? value.white : gammaPosition
    moveMarker(marker, position + direction * (marker === 'gamma' ? maximum / 100 : 1))
  }

  return (
    <div
      ref={ref}
      className="levels-track"
      onPointerDown={handlePointerDown}
      onPointerMove={(event) => active && moveMarker(active, valueFromPointer(event.clientX))}
      onPointerUp={(event) => { setActive(null); event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => setActive(null)}
    >
      <span className="levels-track-gradient" />
      <button
        type="button"
        className="level-marker marker-black"
        style={{ left: `${value.black / maximum * 100}%` }}
        role="slider"
        aria-label="Точка чёрного"
        aria-valuemin={0}
        aria-valuemax={value.white - 1}
        aria-valuenow={value.black}
        onKeyDown={(event) => handleKey('black', event)}
      />
      <button
        type="button"
        className="level-marker marker-gamma"
        style={{ left: `${gammaPosition / maximum * 100}%` }}
        role="slider"
        aria-label="Гамма"
        aria-valuemin={0.1}
        aria-valuemax={9.9}
        aria-valuenow={Number(value.gamma.toFixed(2))}
        onKeyDown={(event) => handleKey('gamma', event)}
      />
      <button
        type="button"
        className="level-marker marker-white"
        style={{ left: `${value.white / maximum * 100}%` }}
        role="slider"
        aria-label="Точка белого"
        aria-valuemin={value.black + 1}
        aria-valuemax={maximum}
        aria-valuenow={value.white}
        onKeyDown={(event) => handleKey('white', event)}
      />
    </div>
  )
}

export function LevelsDialog({ document, open, onPreview, onApply, onClose }: LevelsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedChannel, setSelectedChannel] = useState<LevelsChannel>('master')
  const [settings, setSettings] = useState<LevelsSettings | null>(null)
  const [scale, setScale] = useState<HistogramScale>('linear')
  const [preview, setPreview] = useState(true)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && document) {
      setSelectedChannel('master')
      setSettings(createDefaultLevels(document))
      setScale('linear')
      setPreview(true)
      if (dialog && !dialog.open) dialog.showModal()
    } else if (dialog?.open) {
      dialog.close()
    }
  }, [document, open])

  useEffect(() => {
    if (!open || !document || !settings || !preview) {
      onPreview(null)
      return
    }
    const frame = requestAnimationFrame(() => onPreview(applyLevels(document, settings)))
    return () => cancelAnimationFrame(frame)
  }, [document, onPreview, open, preview, settings])

  const histogram = useMemo(
    () => document ? buildHistogram(document, selectedChannel) : null,
    [document, selectedChannel],
  )

  if (!document || !settings || !histogram) {
    return <dialog ref={dialogRef} className="levels-dialog" />
  }

  const current = settings[selectedChannel]
  const maximum = levelDomainMax(document, selectedChannel)

  const updateCurrent = (next: LevelSettings) => {
    setSettings((previous) => previous ? { ...previous, [selectedChannel]: next } : previous)
  }

  const cancel = () => {
    onPreview(null)
    onClose()
  }

  const apply = () => {
    onApply(applyLevels(document, settings))
    onPreview(null)
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="levels-dialog"
      aria-labelledby="levels-title"
      onCancel={(event) => { event.preventDefault(); cancel() }}
    >
      <div className="levels-dialog-shell">
        <header className="levels-header">
          <span className="levels-title-icon"><BarChart3 size={18} /></span>
          <div>
            <h2 id="levels-title">Уровни</h2>
            <p>Градационная коррекция изображения</p>
          </div>
          <button type="button" className="icon-button" onClick={cancel} aria-label="Закрыть уровни"><X size={17} /></button>
        </header>

        <div className="levels-toolbar">
          <label>
            <span>Канал</span>
            <select value={selectedChannel} onChange={(event) => setSelectedChannel(event.target.value as LevelsChannel)}>
              {levelsChannels(document).map((channel) => <option key={channel} value={channel}>{channelLabels[channel]}</option>)}
            </select>
          </label>
          <div className="histogram-scale" aria-label="Масштаб гистограммы">
            <span>Шкала</span>
            <div>
              <button type="button" className={scale === 'linear' ? 'active' : ''} onClick={() => setScale('linear')} aria-pressed={scale === 'linear'}>Линейная</button>
              <button type="button" className={scale === 'logarithmic' ? 'active' : ''} onClick={() => setScale('logarithmic')} aria-pressed={scale === 'logarithmic'}>Логарифмическая</button>
            </div>
          </div>
        </div>

        <section className="histogram-panel">
          <HistogramCanvas histogram={histogram} scale={scale} channel={selectedChannel} />
          <div className="histogram-meta">
            <span>{histogram.pixelCount.toLocaleString('ru-RU')} пикс.</span>
            <span>{scale === 'linear' ? 'Линейная шкала' : 'Логарифмическая шкала'}</span>
          </div>
        </section>

        <section className="input-levels-panel">
          <div className="input-levels-heading">
            <h3>Входные уровни</h3>
            <span>0–{maximum}</span>
          </div>
          <LevelsTrack value={current} maximum={maximum} onChange={updateCurrent} />
          <div className="level-fields">
            <label>
              <span>Чёрный</span>
              <input
                type="number"
                min={0}
                max={current.white - 1}
                value={current.black}
                onChange={(event) => updateCurrent({ ...current, black: Math.min(current.white - 1, Math.max(0, Number(event.target.value))) })}
              />
            </label>
            <label>
              <span>Гамма</span>
              <input
                type="number"
                min={0.1}
                max={9.9}
                step={0.01}
                value={Number(current.gamma.toFixed(2))}
                onChange={(event) => updateCurrent({ ...current, gamma: Math.min(9.9, Math.max(0.1, Number(event.target.value))) })}
              />
            </label>
            <label>
              <span>Белый</span>
              <input
                type="number"
                min={current.black + 1}
                max={maximum}
                value={current.white}
                onChange={(event) => updateCurrent({ ...current, white: Math.max(current.black + 1, Math.min(maximum, Number(event.target.value))) })}
              />
            </label>
          </div>
        </section>

        <footer className="levels-footer">
          <label className="preview-check">
            <input type="checkbox" checked={preview} onChange={(event) => setPreview(event.target.checked)} />
            <span>Предпросмотр</span>
          </label>
          <div className="levels-actions">
            <button type="button" className="button secondary reset-button" onClick={() => setSettings(createDefaultLevels(document))}><RotateCcw size={15} /> Сбросить</button>
            <button type="button" className="button secondary" onClick={cancel}>Отмена</button>
            <button type="button" className="button primary" onClick={apply}>Применить</button>
          </div>
        </footer>
      </div>
    </dialog>
  )
}
