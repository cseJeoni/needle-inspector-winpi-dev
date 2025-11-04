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
      setDropdownPosition({
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
      // displayName이나 _isSelectContent로 확인 (프로덕션 빌드 호환)
      if (child && child.type && (child.type.displayName === 'SelectContent' || child.type._isSelectContent)) {
        if (Array.isArray(child.props.children)) {
          selectItems = child.props.children.filter(item => 
            item && item.type && (item.type.displayName === 'SelectItem' || item.type._isSelectItem)
          )
        } else if (child.props.children && child.props.children.type && 
                  (child.props.children.type.displayName === 'SelectItem' || child.props.children.type._isSelectItem)) {
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
    if (child && child.type && (child.type.displayName === 'SelectTrigger' || child.type._isSelectTrigger)) {
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
    if (child && child.type && (child.type.displayName === 'SelectContent' || child.type._isSelectContent)) {
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
  
  // position이 제대로 설정되지 않았으면 기본값 사용하지 않고 숨김
  if (!position || position.top === 0 || position.left === 0) {
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

// 프로덕션 빌드에서도 컴포넌트 식별이 가능하도록 설정
SelectTrigger.displayName = 'SelectTrigger';
SelectTrigger._isSelectTrigger = true;
SelectContent.displayName = 'SelectContent';
SelectContent._isSelectContent = true;
SelectItem.displayName = 'SelectItem';
SelectItem._isSelectItem = true;
