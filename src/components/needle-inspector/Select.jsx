import { useState, cloneElement, useRef, useEffect } from "react"

export function Select({ children, defaultValue, value, onValueChange, disabled, style }) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedValue, setSelectedValue] = useState(value || defaultValue || "")
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)

  const currentValue = value !== undefined ? value : selectedValue

  const handleSelect = (newValue) => {
    setSelectedValue(newValue)
    if (onValueChange) {
      onValueChange(newValue)
    }
    setIsOpen(false)
  }

  const handleToggle = (event) => {
    if (disabled) return
    
    if (!isOpen) {
      // 클릭된 요소의 위치를 직접 사용
      const triggerElement = event.currentTarget
      const rect = triggerElement.getBoundingClientRect()
      console.log('트리거 위치 (직접):', rect)
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width
      })
      console.log('설정된 드롭다운 위치:', {
        top: rect.bottom + window.scrollY + 2,
        left: rect.left + window.scrollX,
        width: rect.width
      })
    }
    setIsOpen(!isOpen)
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
        onClick: handleToggle,
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
        onSelect: handleSelect,
        position: dropdownPosition
      })
    }
    return child
  }) : children

  return (
    <div style={{ position: 'relative', overflow: 'visible', ...style }}>
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

export function SelectContent({ children, onSelect, position }) {
  const items = Array.isArray(children) ? children : [children]
  
  console.log('SelectContent 렌더링:', { position, hasTop: !!position?.top, hasLeft: !!position?.left })
  
  // position이 제대로 설정되지 않았으면 기본값 사용하지 않고 숨김
  if (!position || position.top === 0 || position.left === 0) {
    console.warn('드롭다운 위치가 설정되지 않음:', position)
    return null
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: `${position.top}px`,
      left: `${position.left}px`,
      width: `${position.width}px`,
      backgroundColor: '#171C26',
      border: '1px solid #4B5563',
      borderRadius: '0.375rem',
      zIndex: 9999,
      maxHeight: '9dvh',
      overflowY: 'auto',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
    }}
    onMouseDown={(e) => {
      e.stopPropagation();
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
              fontSize: '1.1dvh',
              backgroundColor: 'transparent',
              height: '3dvh',
              display: 'flex',
              alignItems: 'center',
              borderBottom: index < items.length - 1 ? '1px solid #374151' : 'none',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
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
