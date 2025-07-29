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
        padding: '1.8dvh', 
        gap: '2dvh' 
      }}
    >
      <h2
        className={titleClassName}
        style={{ 
          fontSize: '1.7dvh',
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
          gap: '1.8dvh' 
        }}
      >
        {children}
      </div>
    </div>
  )
}
