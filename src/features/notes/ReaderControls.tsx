import { useId } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { DEFAULT_READER_SETTINGS, type ReaderSettings, type ThemeChoice } from '../../types'
import { t } from '../../i18n/i18n'

type Option<T extends string> = [value: T, label: () => string]

const SIZES: Option<ReaderSettings['size']>[] = [['small', () => t('Small')], ['medium', () => t('Medium')], ['large', () => t('Large')], ['larger', () => t('Larger')]]
const FONTS: Option<ReaderSettings['font']>[] = [['classic', () => t('Classic')], ['simple', () => t('Simple')]]
const SPACINGS: Option<ReaderSettings['spacing']>[] = [['normal', () => t('Normal')], ['roomy', () => t('Roomy')]]
const WIDTHS: Option<ReaderSettings['width']>[] = [['narrow', () => t('Narrow')], ['medium', () => t('Medium')], ['wide', () => t('Wide')]]
const THEMES: Option<ThemeChoice>[] = [['light', () => t('Light')], ['paper', () => t('Soft paper')], ['dark', () => t('Dark')], ['system', () => t('System')]]

function Choice<T extends string>({ legend, name, options, value, onChange }: { legend: string; name: string; options: Option<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset className="reader-choice">
      <legend>{legend}</legend>
      <div className="reader-options">
        {options.map(([option, label]) => (
          <label key={option} className="reader-option">
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{label()}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * The reading room's settings (design specification, section 4): text size, style, line spacing,
 * line length, and theme. Each takes effect at once and is remembered; Reset returns to the
 * defaults. A panel under the reader's bar on wide screens, a sheet from the bottom on phones.
 */
export function ReaderControls({
  id,
  settings,
  theme,
  onChange,
  onTheme,
  onClose,
}: {
  id: string
  settings: ReaderSettings
  theme: ThemeChoice
  onChange: (settings: ReaderSettings) => void
  onTheme: (theme: ThemeChoice) => void
  onClose: () => void
}) {
  const name = useId()
  const set = <K extends keyof ReaderSettings>(key: K) => (value: ReaderSettings[K]) => onChange({ ...settings, [key]: value })
  return (
    <section id={id} className="reader-controls" aria-labelledby={`${name}-heading`}>
      <div className="reader-controls-header">
        <h2 id={`${name}-heading`} className="section-label">{t('Reading settings')}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={t('Close reading settings')}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="reader-controls-grid">
        <Choice legend={t('Text size')} name={`${name}-size`} options={SIZES} value={settings.size} onChange={set('size')} />
        <Choice legend={t('Text style')} name={`${name}-font`} options={FONTS} value={settings.font} onChange={set('font')} />
        <Choice legend={t('Line spacing')} name={`${name}-spacing`} options={SPACINGS} value={settings.spacing} onChange={set('spacing')} />
        <Choice legend={t('Line length')} name={`${name}-width`} options={WIDTHS} value={settings.width} onChange={set('width')} />
        <Choice legend={t('Color theme')} name={`${name}-theme`} options={THEMES} value={theme} onChange={onTheme} />
      </div>
      <button type="button" className="secondary-button" onClick={() => onChange(DEFAULT_READER_SETTINGS)}>
        <RotateCcw size={14} aria-hidden="true" /> {t('Reset reading settings')}
      </button>
    </section>
  )
}
