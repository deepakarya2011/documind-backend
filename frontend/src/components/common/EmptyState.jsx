// Centered empty state: icon + title + hint + optional action.
export default function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon">{icon}</span>}
      <h2>{title}</h2>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  )
}
