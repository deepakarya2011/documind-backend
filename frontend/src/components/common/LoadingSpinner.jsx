// Small / large loading spinner with optional label.
export default function LoadingSpinner({ label, large = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className={`spinner${large ? ' lg' : ''}`} role="status" aria-label={label || 'Loading'} />
      {label && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>}
    </span>
  )
}
