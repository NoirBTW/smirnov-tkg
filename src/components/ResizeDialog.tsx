import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { HelpCircle, Link2, Maximize2, X } from 'lucide-react'
import type { ImageDocument } from '../lib/gb7'
import {
  interpolationAlgorithms,
  resizeImageDocument,
  validateTargetSize,
  type InterpolationMethod,
} from '../lib/resampling'

type ResizeUnit = 'pixels' | 'percent'

type ResizeDialogProps = {
  document: ImageDocument | null
  open: boolean
  onApply: (document: ImageDocument, method: InterpolationMethod) => void
  onClose: () => void
}

function formatPixels(value: number) {
  if (!Number.isFinite(value)) return '—'
  const megapixels = value / 1_000_000
  return `${megapixels.toLocaleString('ru-RU', { maximumFractionDigits: 3, minimumFractionDigits: megapixels < 0.1 ? 3 : 0 })} Мп`
}

function parsePositive(value: string) {
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function ResizeDialog({ document, open, onApply, onClose }: ResizeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tooltipId = useId()
  const [unit, setUnit] = useState<ResizeUnit>('pixels')
  const [widthValue, setWidthValue] = useState('1')
  const [heightValue, setHeightValue] = useState('1')
  const [linked, setLinked] = useState(true)
  const [method, setMethod] = useState<InterpolationMethod>('bilinear')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (open && document) {
      setUnit('pixels')
      setWidthValue(String(document.width))
      setHeightValue(String(document.height))
      setLinked(true)
      setMethod('bilinear')
      setTouched(false)
      if (dialog && !dialog.open) dialog.showModal()
    } else if (dialog?.open) {
      dialog.close()
    }
  }, [document, open])

  const target = useMemo(() => {
    if (!document) return { width: 0, height: 0 }
    const rawWidth = parsePositive(widthValue)
    const rawHeight = parsePositive(heightValue)
    return unit === 'pixels'
      ? { width: Math.round(rawWidth), height: Math.round(rawHeight) }
      : {
          width: Math.round(document.width * rawWidth / 100),
          height: Math.round(document.height * rawHeight / 100),
        }
  }, [document, heightValue, unit, widthValue])

  const error = document
    ? (!Number.isFinite(target.width) || !Number.isFinite(target.height)
        ? 'Введите числовые значения ширины и высоты.'
        : unit === 'percent' && [parsePositive(widthValue), parsePositive(heightValue)].some((value) => value < 1 || value > 1000)
          ? 'Процент должен быть в диапазоне от 1 до 1000.'
          : validateTargetSize(target.width, target.height))
    : 'Изображение не открыто.'

  const setDimension = (axis: 'width' | 'height', value: string) => {
    setTouched(true)
    if (axis === 'width') setWidthValue(value)
    else setHeightValue(value)
    if (!linked || !document) return

    const number = parsePositive(value)
    if (!Number.isFinite(number)) return
    if (unit === 'percent') {
      if (axis === 'width') setHeightValue(value)
      else setWidthValue(value)
    } else if (axis === 'width') {
      setHeightValue(String(Math.max(1, Math.round(number * document.height / document.width))))
    } else {
      setWidthValue(String(Math.max(1, Math.round(number * document.width / document.height))))
    }
  }

  const changeUnit = (next: ResizeUnit) => {
    if (!document || next === unit) return
    if (next === 'percent') {
      setWidthValue(String(Number((target.width / document.width * 100).toFixed(2))))
      setHeightValue(String(Number((target.height / document.height * 100).toFixed(2))))
    } else {
      setWidthValue(String(target.width))
      setHeightValue(String(target.height))
    }
    setUnit(next)
    setTouched(false)
  }

  const cancel = () => onClose()

  const apply = () => {
    if (!document || error) {
      setTouched(true)
      return
    }
    onApply(resizeImageDocument(document, target.width, target.height, method), method)
    onClose()
  }

  if (!document) return <dialog ref={dialogRef} className="resize-dialog" />

  const algorithm = interpolationAlgorithms[method]

  return (
    <dialog
      ref={dialogRef}
      className="resize-dialog"
      aria-labelledby="resize-title"
      onCancel={(event) => { event.preventDefault(); cancel() }}
    >
      <form className="resize-dialog-shell" onSubmit={(event) => { event.preventDefault(); apply() }}>
        <header className="levels-header">
          <span className="levels-title-icon"><Maximize2 size={18} /></span>
          <div>
            <h2 id="resize-title">Изменить размер</h2>
            <p>Создание изображения с новыми размерами</p>
          </div>
          <button type="button" className="icon-button" onClick={cancel} aria-label="Закрыть изменение размера"><X size={17} /></button>
        </header>

        <div className="resize-body">
          <section className="pixel-summary" aria-label="Количество пикселей">
            <div><span>До</span><strong>{formatPixels(document.width * document.height)}</strong><small>{(document.width * document.height).toLocaleString('ru-RU')} пикс.</small></div>
            <span aria-hidden="true">→</span>
            <div><span>После</span><strong>{formatPixels(Math.max(0, target.width * target.height))}</strong><small>{Number.isFinite(target.width * target.height) ? Math.max(0, target.width * target.height).toLocaleString('ru-RU') : '—'} пикс.</small></div>
          </section>

          <div className="resize-form-grid">
            <label className="field full-field">
              <span>Единицы измерения</span>
              <select value={unit} onChange={(event) => changeUnit(event.target.value as ResizeUnit)}>
                <option value="pixels">Пиксели</option>
                <option value="percent">Проценты</option>
              </select>
            </label>

            <label className="field">
              <span>Ширина {unit === 'percent' ? '(%)' : '(px)'}</span>
              <input
                type="number"
                min={1}
                max={unit === 'percent' ? 1000 : 8192}
                step={unit === 'percent' ? 0.01 : 1}
                value={widthValue}
                onChange={(event) => setDimension('width', event.target.value)}
                aria-invalid={Boolean(touched && error)}
              />
            </label>
            <button
              type="button"
              className={`aspect-lock ${linked ? 'active' : ''}`}
              onClick={() => setLinked((value) => !value)}
              aria-pressed={linked}
              aria-label={linked ? 'Отключить сохранение пропорций' : 'Сохранять пропорции'}
              title={linked ? 'Пропорции связаны' : 'Пропорции не связаны'}
            >
              <Link2 size={16} />
            </button>
            <label className="field">
              <span>Высота {unit === 'percent' ? '(%)' : '(px)'}</span>
              <input
                type="number"
                min={1}
                max={unit === 'percent' ? 1000 : 8192}
                step={unit === 'percent' ? 0.01 : 1}
                value={heightValue}
                onChange={(event) => setDimension('height', event.target.value)}
                aria-invalid={Boolean(touched && error)}
              />
            </label>

            <label className="field full-field algorithm-field">
              <span>Интерполяция</span>
              <span className="select-with-tooltip">
                <select value={method} onChange={(event) => setMethod(event.target.value as InterpolationMethod)}>
                  {Object.values(interpolationAlgorithms).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
                <span className="tooltip-anchor">
                  <button type="button" className="help-button" aria-describedby={tooltipId} aria-label={`Справка: ${algorithm.label}`}><HelpCircle size={17} /></button>
                  <span id={tooltipId} role="tooltip" className="algorithm-tooltip"><strong>{algorithm.label}</strong>{algorithm.description}</span>
                </span>
              </span>
            </label>
          </div>

          <label className="preview-check aspect-checkbox">
            <input type="checkbox" checked={linked} onChange={(event) => setLinked(event.target.checked)} />
            <span>Сохранять пропорции исходного изображения</span>
          </label>

          <p className={`resize-validation ${touched && error ? 'visible' : ''}`} role="alert">
            {touched && error ? error : `Результат: ${target.width} × ${target.height} px`}
          </p>
        </div>

        <footer className="levels-footer resize-footer">
          <span>Исходник в памяти не изменяется до применения.</span>
          <div className="levels-actions">
            <button type="button" className="button secondary" onClick={cancel}>Отмена</button>
            <button type="submit" className="button primary" disabled={Boolean(error)}>Применить</button>
          </div>
        </footer>
      </form>
    </dialog>
  )
}
