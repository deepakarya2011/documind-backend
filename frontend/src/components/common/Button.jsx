// Reusable button: primary / default / danger / ghost, small size.
export default function Button({
  children, variant = 'default', size = '', type = 'button', className = '',
  disabled = false, onClick, title, ...rest
}) {
  const cls = ['btn', variant !== 'default' ? `btn-${variant}` : '', size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean).join(' ')
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} title={title} {...rest}>
      {children}
    </button>
  )
}
