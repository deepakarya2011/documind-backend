// Animated "thinking" indicator while the backend retrieves + generates.
export default function TypingIndicator({ label = 'Searching your documents…' }) {
  return (
    <span className="typing" role="status" aria-label={label}>
      <i /><i /><i /> {label}
    </span>
  )
}
