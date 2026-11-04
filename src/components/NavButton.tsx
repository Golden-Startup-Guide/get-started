

export function NavButton({
  active,
  label,
  count,
  icon,
  onClick,
  className = '',
}: {
  active: boolean
  label: string
  /** Left out where counting would cost too much, such as saved searches. */
  count?: number
  icon: React.ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button className={`nav-button flex w-full items-center gap-3 text-left ${className} ${active ? 'nav-button-active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="shrink-0">{icon}</span><span className="min-w-0 flex-1 truncate">{label}</span>{count !== undefined && <span className="text-xs tabular-nums text-[var(--muted)]">{count}</span>}
    </button>
  )
}
