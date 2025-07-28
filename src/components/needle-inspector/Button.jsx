export function Button({ children, onClick, disabled, className, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        padding: '0.5dvh 1dvw',
        borderRadius: '0.375rem',
        fontWeight: '500',
        fontSize: '1dvh',
        backgroundColor: '#3B82F6',
        color: 'white',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s ease-in-out',
        outline: 'none',
        ...style
      }}
    >
      {children}
    </button>
  )
}
