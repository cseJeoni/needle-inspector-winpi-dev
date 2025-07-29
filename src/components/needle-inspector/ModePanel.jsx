"use client"

import { useState, useRef, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"

export default function ModePanel({ mode, setMode, makerCode, setMakerCode }) {
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

  const handleMakerChange = (value) => {
    setMakerCode(value)
  }

  return (
    <Panel
      title="판단"
      titleClassName={isLocked ? "cursor-pointer" : ""}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
    >
      
    </Panel>
  )
}
