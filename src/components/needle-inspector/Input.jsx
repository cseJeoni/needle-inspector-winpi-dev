export function Input({ value, onChange, readOnly, className, style, ...props }) {
  return (
    <input
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      className={className}
      style={{
        padding: '0.5dvh 1dvw',
        borderRadius: '0.375rem',
        fontSize: '1.2dvh',
        backgroundColor: '#171C26',
        color: 'white',
        border: 'none',
        outline: 'none',
        ...style
      }}
      {...props}
    />
  )
}
