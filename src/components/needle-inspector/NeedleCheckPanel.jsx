"use client"

import { useState } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"

export default function NeedleCheckPanel({ mode }) {
  const [needleStatus, setNeedleStatus] = useState("UP")

  const toggleNeedleStatus = () => {
    setNeedleStatus((prev) => (prev === "UP" ? "DOWN" : "UP"))
  }

  // 1.0부터 20.0까지 0.1 간격으로 생성
  const needleLengthOptions = Array.from({ length: 191 }, (_, i) => (1 + i * 0.1).toFixed(1))

  return (
    <Panel title="니들 확인 - 깊이(mm)">
      <div style={{ display: 'flex', width: '100%', gap: '1dvw' }}>
        <Select defaultValue="3.0">
          <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', width: '50%', fontSize: '1.2dvh', height: '4dvh' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {needleLengthOptions.map((val) => (
              <SelectItem key={val} value={val}>
                {val}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          onClick={toggleNeedleStatus} 
          style={{ 
            backgroundColor: '#171C26', 
            color: '#BFB2E4', 
            width: '40%', 
            fontSize: '1.8dvh', 
            height: '4dvh', 
            border: '1px solid #BFB2E4', 
            borderRadius: '0.375rem', 
            cursor: 'pointer' 
          }}
        >
          Needle {needleStatus}
        </Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '40%', fontSize: '1.5dvh', color: '#D1D5DB' }}>EPROM-FAIL</label>
          <Input readOnly value="0" style={{ backgroundColor: '#171C26', border: 'none', color: 'white', textAlign: 'center', fontSize: '1.2dvh', height: '4dvh', borderRadius: '0.375rem' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '40%', fontSize: '1.5dvh', color: '#D1D5DB' }}>작업 수량</label>
          <Input readOnly value="0" style={{ backgroundColor: '#171C26', border: 'none', color: 'white', textAlign: 'center', fontSize: '1.2dvh', height: '4dvh', borderRadius: '0.375rem' }} />
        </div>
        {mode === "검사" && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ width: '40%', fontSize: '1.5dvh', color: '#D1D5DB' }}>검사 수량</label>
            <Input readOnly value="0" style={{ backgroundColor: '#171C26', border: 'none', color: 'white', textAlign: 'center', fontSize: '1.2dvh', height: '4dvh', borderRadius: '0.375rem' }} />
          </div>
        )}
      </div>
    </Panel>
  )
}
