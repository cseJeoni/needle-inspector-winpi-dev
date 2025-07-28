"use client"

import { useState, useRef, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"

export default function ModePanel({ mode, setMode }) {
  const [isLocked, setIsLocked] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    setIsLocked(mode === "생산")
  }, [mode])

  const handlePressStart = () => {
    if (isLocked) {
      timerRef.current = setTimeout(() => {
        setMode("검사")
        setIsLocked(false)
      }, 3000)
    }
  }

  const handlePressEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handleModeChange = (value) => {
    setMode(value)
  }

  return (
    <Panel
      title="MODE"
      titleClassName={isLocked ? "cursor-pointer" : ""}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
    >
      <fieldset disabled={isLocked} style={{ display: 'flex', flexDirection: 'column', gap: '3dvh', border: 'none', padding: 0, margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '50%', fontSize: '1.5dvh', color: '#D1D5DB' }}>MODE</label>
          <Select value={mode} onValueChange={handleModeChange} disabled={isLocked}>
            <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="생산">생산</SelectItem>
              <SelectItem value="검사">검사</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '50%', fontSize: '1.5dvh', color: '#D1D5DB' }}>MAKER</label>
          <Select defaultValue="4" disabled={isLocked}>
            <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '50%', fontSize: '1.5dvh', color: '#D1D5DB' }}>Needle Origin Offset(mm)</label>
          <Select defaultValue="0.4" disabled={isLocked}>
            <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.4">0.4</SelectItem>
              <SelectItem value="0.5">0.5</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      <div style={{ flexGrow: 1 }} />
      <Button
        disabled={isLocked}
        style={{
          width: '100%',
          fontWeight: 'bold',
          backgroundColor: '#171C26',
          color: isLocked ? '#9CA3AF' : '#3B82F6',
          padding: '1dvh 0',
          fontSize: '1.8dvh',
          border: isLocked ? '1px solid #9CA3AF' : '1px solid #3B82F6',
          borderRadius: '0.375rem',
          cursor: isLocked ? 'not-allowed' : 'pointer'
        }}
      >
        SAVE
      </Button>
    </Panel>
  )
}
