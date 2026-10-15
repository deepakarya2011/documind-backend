// CSS-only tooltip for icon buttons. Wraps the control.
export default function Tooltip({ label, children }) {
  if (!label) return children
  return (
    <span className="tip-wrap">
      {children}
      <span className="tip" role="tooltip">{label}</span>
    </span>
  )
}
