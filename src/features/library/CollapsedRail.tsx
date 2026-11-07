import type { ReactNode, RefObject } from 'react'
import { CalendarDays, FileText, Heart, Home, Network, PanelLeftOpen, Plus, Search, Settings, Trash2 } from 'lucide-react'
import type { View } from '../../state/workspaceStore'
import { t } from '../../i18n/i18n'

/**
 * The sidebar collapsed to a narrow rail of icons, on wide screens: the main places stay one
 * click away. Each icon has a name that screen readers announce and a tooltip on hover or focus,
 * so no one has to guess from its shape.
 */
export function CollapsedRail({
  view,
  expandRef,
  onExpand,
  onNavigate,
  onNewNote,
  onOpenToday,
  onOpenSettings,
}: {
  view: View
  expandRef: RefObject<HTMLButtonElement>
  onExpand: () => void
  onNavigate: (view: View) => void
  onNewNote: () => void
  onOpenToday: () => void
  onOpenSettings: () => void
}) {
  const item = (label: string, icon: ReactNode, onClick: () => void, current?: boolean) => (
    <button type="button" className="rail-button" aria-label={label} data-tooltip={label} aria-current={current ? 'page' : undefined} onClick={onClick}>
      {icon}
    </button>
  )
  return (
    <nav className="collapsed-rail" aria-label={t('Primary navigation')}>
      <button ref={expandRef} type="button" className="rail-button" aria-label={t('Expand sidebar')} data-tooltip={t('Expand sidebar')} aria-expanded={false} aria-controls="workspace-navigation" onClick={onExpand}>
        <PanelLeftOpen size={18} aria-hidden="true" />
      </button>
      {item(t('New note'), <Plus size={18} aria-hidden="true" />, onNewNote)}
      <span className="rail-divider" aria-hidden="true" />
      {item(t('Home'), <Home size={18} aria-hidden="true" />, () => onNavigate('home'), view === 'home')}
      {item(t('Search'), <Search size={18} aria-hidden="true" />, () => onNavigate('search'), view === 'search')}
      {item(t('All Notes'), <FileText size={18} aria-hidden="true" />, () => onNavigate('all'), view === 'all')}
      {item(t('Favorites'), <Heart size={18} aria-hidden="true" />, () => onNavigate('favorites'), view === 'favorites')}
      {item(t('Note map'), <Network size={18} aria-hidden="true" />, () => onNavigate('graph'), view === 'graph')}
      {item(t('Today’s note'), <CalendarDays size={18} aria-hidden="true" />, onOpenToday)}
      {item(t('Trash'), <Trash2 size={18} aria-hidden="true" />, () => onNavigate('trash'), view === 'trash')}
      <span className="rail-spacer" aria-hidden="true" />
      {item(t('Settings'), <Settings size={18} aria-hidden="true" />, onOpenSettings)}
    </nav>
  )
}
