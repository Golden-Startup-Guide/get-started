import { useId, useState, type MouseEvent } from 'react'
import { ArrowLeft, MapPin } from 'lucide-react'
import { routeToHash } from '../../lib/routes'
import type { View } from '../../state/workspaceStore'
import { t } from '../../i18n/i18n'

export interface Crumb {
  label: string
  view: View
}

/**
 * Where the current page sits: each level above it as a link, then the page itself. On narrow
 * screens this becomes a link back to the level above, and a "Page location" button that shows
 * the whole path.
 */
export function Breadcrumb({ trail, current, onNavigate }: { trail: Crumb[]; current: string; onNavigate: (view: View) => void }) {
  const [pathOpen, setPathOpen] = useState(false)
  const pathId = useId()
  if (!trail.length) return null
  const parent = trail[trail.length - 1]
  // Real links, so they can be opened in a new tab; a plain click moves within the app.
  const follow = (view: View) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setPathOpen(false)
    onNavigate(view)
  }
  const path = (
    <>
      {trail.map((crumb, index) => (
        <li key={`${crumb.view}-${index}`}>
          <a href={routeToHash({ view: crumb.view })} onClick={follow(crumb.view)}>{crumb.label}</a>
          <span aria-hidden="true">/</span>
        </li>
      ))}
      <li><span aria-current="page">{current}</span></li>
    </>
  )
  return (
    <nav className="workspace-breadcrumb mb-1" aria-label={t('Breadcrumb')}>
      <ol className="breadcrumb-full">{path}</ol>
      <div className="breadcrumb-compact">
        <a href={routeToHash({ view: parent.view })} onClick={follow(parent.view)} className="breadcrumb-parent">
          <ArrowLeft size={14} aria-hidden="true" /> {parent.label}
        </a>
        <button type="button" className="breadcrumb-location" aria-expanded={pathOpen} aria-controls={pathId} onClick={() => setPathOpen((open) => !open)}>
          <MapPin size={14} aria-hidden="true" /> {t('Page location')}
        </button>
        {pathOpen && <ol id={pathId} className="breadcrumb-path">{path}</ol>}
      </div>
    </nav>
  )
}
