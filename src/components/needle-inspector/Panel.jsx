"use client"

export default function Panel({
  title,
  children,
  className = "",
  titleClassName = "",
  contentClassName = "",
  onMouseDown,
  onMouseUp,
  onTouchStart,
  onTouchEnd,
}) {
  return (
    <div 
      className={className}
      style={{ 
        backgroundColor: '#3B3E46', 
        borderRadius: '0.5rem', 
        display: 'flex', 
        flexDirection: 'column',
        padding: '1.2dvh', 
        gap: '1dvh',
        height: '100%'
      }}
    >
      <h2
        className={titleClassName}
        style={{ 
          fontSize: '1.8dvh',
          fontWeight: 'bold',
          color: '#D1D5DB',
          margin: 0
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {title}
      </h2>
      <div 
        className={contentClassName} 
        style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.8dvh',
          overflow: 'hidden'
        }}
      >
        {children}
      </div>
    </div>
  )
}
