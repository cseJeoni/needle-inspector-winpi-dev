import { useState, cloneElement } from "react"

export function Select({ children, defaultValue, value, onValueChange, disabled, style }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedValue, setSelectedValue] = useState(value || defaultValue || "")

  const currentValue = value !== undefined ? value : selectedValue

  const handleSelect = (newValue) => {
    setSelectedValue(newValue)
    if (onValueChange) {
      onValueChange(newValue)
    }
    setIsOpen(false)
  }

  // SelectContent에서 SelectItem들 찾기
  let selectItems = []
  if (Array.isArray(children)) {
    children.forEach(child => {
      if (child && child.type && child.type.name === 'SelectContent') {
        if (Array.isArray(child.props.children)) {
          selectItems = child.props.children.filter(item => 
            item && item.type && item.type.name === 'SelectItem'
          )
        } else if (child.props.children && child.props.children.type && child.props.children.type.name === 'SelectItem') {
          selectItems = [child.props.children]
        }
      }
    })
  }

  // 현재 선택된 값의 텍스트 찾기
  const selectedItem = selectItems.find(item => item.props.value === currentValue)
  const displayText = selectedItem ? selectedItem.props.children : currentValue

  // children을 수정해서 전달
  const modifiedChildren = Array.isArray(children) ? children.map(child => {
    if (child && child.type && child.type.name === 'SelectTrigger') {
      return cloneElement(child, {
        onClick: () => !disabled && setIsOpen(!isOpen),
        disabled,
        currentValue: displayText,
        style: {
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...child.props.style
        }
      })
    }
    if (child && child.type && child.type.name === 'SelectContent') {
      if (!isOpen || disabled) return null
      return cloneElement(child, {
        onSelect: handleSelect
      })
    }
    return child
  }) : children

  return (
    <div style={{ position: 'relative', ...style }}>
      {modifiedChildren}
    </div>
  )
}

export function SelectTrigger({ children, onClick, disabled, className, style, currentValue }) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: '#171C26',
        border: 'none',
        color: 'white',
        borderRadius: '0.375rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.8dvh 1.2dvw',
        fontSize: '1.8dvh',
        height: '3.5dvh',
        minWidth: '5dvw',
        cursor: 'pointer',
        ...style
      }}
      onClick={onClick}
    >
      <span>{currentValue}</span>
      <span style={{ marginLeft: '0.5rem' }}>▼</span>
    </div>
  )
}

export function SelectValue({ value }) {
  return null // SelectTrigger에서 직접 처리
}

export function SelectContent({ children, onSelect }) {
  const items = Array.isArray(children) ? children : [children]
  
  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      backgroundColor: '#171C26',
      border: '1px solid #4B5563',
      borderRadius: '0.375rem',
      marginTop: '0.25rem',
      zIndex: 10,
      maxHeight: '10rem',
      minWidth: '15dvw',
      overflowY: 'auto'
    }}>
      {items.map((item, index) => {
        if (!item || !item.props) return null
        
        return (
          <div
            key={item.props.value || index}
            style={{
              padding: '0.8dvh 1.2dvw',
              cursor: 'pointer',
              color: 'white',
              fontSize: '1.3dvh',
              backgroundColor: 'transparent',
              height: '3.5dvh',
              display: 'flex',
              alignItems: 'center'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#4B5563'
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent'
            }}
            onClick={() => {
              if (onSelect && item.props.value !== undefined) {
                onSelect(item.props.value)
              }
            }}
          >
            {item.props.children}
          </div>
        )
      })}
    </div>
  )
}

export function SelectItem({ value, children }) {
  return <div data-value={value}>{children}</div>
}
