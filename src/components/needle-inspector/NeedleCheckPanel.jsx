"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"

export default function NeedleCheckPanel({ mode, isMotorConnected, needlePosition, onNeedleUp, onNeedleDown }) {
  // 모터 상태에 따라 needleStatus 동기화
  const [needleStatus, setNeedleStatus] = useState(needlePosition === 'UP' ? 'UP' : needlePosition === 'DOWN' ? 'DOWN' : 'MOVING')
  // 버튼에 표시할 텍스트 (다음 동작을 표시, MOVING일 때는 현재 상태 유지)
  const buttonText = needleStatus === 'UP' ? 'DOWN' : needleStatus === 'DOWN' ? 'UP' : (needlePosition === 'UP' ? 'UP' : 'DOWN')

  const [repeatCount, setRepeatCount] = useState(1)

  // needlePosition prop이 변경될 때마다 needleStatus 동기화
  useEffect(() => {
    if (needlePosition === 'UP') {
      setNeedleStatus('UP')
    } else if (needlePosition === 'DOWN') {
      setNeedleStatus('DOWN')
    } else {
      setNeedleStatus('MOVING')
    }
  }, [needlePosition])

  const toggleNeedleStatus = () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    if (needleStatus === 'DOWN') {
      console.log("🎯 니들 UP 명령 실행")
      onNeedleUp()
    } else if (needleStatus === 'UP') {
      console.log("🎯 니들 DOWN 명령 실행")
      onNeedleDown()
    }
    // MOVING 상태일 때는 버튼 비활성화
  }

  // 1.0부터 20.0까지 0.1 간격으로 생성
  const needleLengthOptions = Array.from({ length: 191 }, (_, i) => (1 + i * 0.1).toFixed(1))

  return (
    <Panel title="니들 깊이 확인 (mm)">
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
          disabled={!isMotorConnected || needleStatus === 'MOVING'}
          style={{ 
            backgroundColor: '#171C26', 
            color: !isMotorConnected ? '#D1D5DB' : '#BFB2E4', 
            width: '70%', 
            minWidth: '100px',
            fontSize: '1.8dvh', 
            height: '4dvh', 
            border: `1px solid ${!isMotorConnected ? '#6B7280' : '#BFB2E4'}`, 
            borderRadius: '0.375rem', 
            cursor: (!isMotorConnected || needleStatus === 'MOVING') ? 'not-allowed' : 'pointer',
            opacity: (!isMotorConnected || needleStatus === 'MOVING') ? 0.6 : 1,
            whiteSpace: 'nowrap'
          }}
        >
          Needle {buttonText} {!isMotorConnected && '(연결안됨)'}
        </Button>
      </div>

      <div style={{ borderTop: '1px solid #374151', paddingTop: '2dvh', marginTop: '2dvh', display: 'flex', flexDirection: 'column', gap: '2dvh' }}>
        <h3 style={{ fontSize: '1.7dvh', fontWeight: 'bold', color: '#D1D5DB', margin: 0 }}>
          니들 소음 확인 
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw' }}>
          <Input 
            type="number"
            value={repeatCount}
            onChange={(e) => setRepeatCount(Number(e.target.value))}
            min={1}
            style={{ 
              backgroundColor: '#171C26', 
              color: 'white', 
              textAlign: 'center',
              width: '25%',
              fontSize: '1.2dvh', 
              height: '4dvh' 
            }}
          />
          <span style={{ color: '#D1D5DB', fontSize: '1.5dvh' }}>회</span>
          <Button
            // onClick={handleUpDown}
            disabled={!isMotorConnected || needleStatus === 'MOVING'}
            style={{
              backgroundColor: '#171C26',
              color: !isMotorConnected ? '#D1D5DB' : '#BFB2E4',
              width: '70%',
              fontSize: '1.8dvh',
              height: '4dvh',
              border: `1px solid ${!isMotorConnected ? '#6B7280' : '#BFB2E4'}`,
              borderRadius: '0.375rem',
              cursor: (!isMotorConnected || needleStatus === 'MOVING') ? 'not-allowed' : 'pointer',
              opacity: (!isMotorConnected || needleStatus === 'MOVING') ? 0.6 : 1
            }}
          >
            UP & DOWN
          </Button>
        </div>
      </div>
    </Panel>
  )
}
