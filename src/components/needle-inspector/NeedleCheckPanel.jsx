"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"
import lockIcon from '../../assets/icon/lock.png';
import unlockIcon from '../../assets/icon/unlock.png';

export default function NeedleCheckPanel({ mode, isMotorConnected, needlePosition, onNeedleUp, onNeedleDown, websocket, isWsConnected, onMotorPositionChange, needleOffset, onNeedleOffsetChange, needleProtrusion, onNeedleProtrusionChange, needleSpeed, onNeedleSpeedChange }) {
  // 모터 상태에 따라 needleStatus 동기화
  const [needleStatus, setNeedleStatus] = useState(needlePosition === 'UP' ? 'UP' : needlePosition === 'DOWN' ? 'DOWN' : 'MOVING')
  // 버튼에 표시할 텍스트 (다음 동작을 표시, MOVING일 때는 현재 상태 유지)
  const buttonText = needleStatus === 'UP' ? 'DOWN' : needleStatus === 'DOWN' ? 'UP' : (needlePosition === 'UP' ? 'UP' : 'DOWN')

  // needleOffset과 needleProtrusion을 props로 받아서 사용
  // const [needleOffset, setNeedleOffset] = useState(0.1)
  // const [needleProtrusion, setNeedleProtrusion] = useState(3.0)
  const [repeatCount, setRepeatCount] = useState(1)
  
  // 니들 설정 활성화 상태 (기본값: 비활성화)
  const [isNeedleCheckEnabled, setIsNeedleCheckEnabled] = useState(false)
  // 니들 소음 확인 상태
  const [isNeedleNoiseChecking, setIsNeedleNoiseChecking] = useState(false)

  // WebSocket을 통한 모터 위치 명령 전송 함수 (속도 모드 지원)
  const sendMotorCommand = (targetPosition) => {
    if (!websocket || !isWsConnected) {
      console.log('WebSocket 연결되지 않음. 모터 명령 전송 실패:', targetPosition);
      return;
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "speed", // 속도 모드로 변경
      motor_id: 1, // 모터 1 사용
      needle_speed: needleSpeed || 1000 // 기본 속도 1000
    }

    console.log(`모터 1 속도/위치 명령 전송:`, msg);
    websocket.send(JSON.stringify(msg));
  }
  
  // 토글 상태 제거 - 단순 이동 명령으로 변경
  
  // 니들 설정 잠금/해제 토글 함수
  const handleNeedleCheckToggle = () => {
    setIsNeedleCheckEnabled(!isNeedleCheckEnabled)
  }

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

  // 파라미터 로드
  useEffect(() => {
    const loadParameters = async () => {
      try {
        const result = await window.electronAPI.getParameters();
        if (result.success && result.data.needleCheckPanel) {
          const params = result.data.needleCheckPanel;
          
          // 저장된 값이 있으면 상위 컴포넌트에 알림
          if (onNeedleOffsetChange && params.needleOffset !== undefined) {
            onNeedleOffsetChange(params.needleOffset);
          }
          if (onNeedleProtrusionChange && params.needleProtrusion !== undefined) {
            onNeedleProtrusionChange(params.needleProtrusion);
          }
          if (onNeedleSpeedChange && params.needleSpeed !== undefined) {
            onNeedleSpeedChange(params.needleSpeed);
          }
          
          console.log('📋 NeedleCheckPanel 파라미터 로드 완료:', params);
        }
      } catch (error) {
        console.error('NeedleCheckPanel 파라미터 로드 실패:', error);
      }
    };
    
    loadParameters();
  }, []);

  // 파라미터 저장 함수
  const saveParameters = async () => {
    try {
      const result = await window.electronAPI.getParameters();
      const currentParams = result.success ? result.data : {};
      
      const updatedParams = {
        ...currentParams,
        needleCheckPanel: {
          needleOffset,
          needleProtrusion,
          needleSpeed
        }
      };
      
      await window.electronAPI.saveParameters(updatedParams);
      console.log('💾 NeedleCheckPanel 파라미터 저장 완료');
    } catch (error) {
      console.error('NeedleCheckPanel 파라미터 저장 실패:', error);
    }
  };

  // 파라미터 변경시 자동 저장 (디바운스 적용)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveParameters();
    }, 500); // 500ms 지연

    return () => clearTimeout(timeoutId);
  }, [needleOffset, needleProtrusion, needleSpeed]);

  // 니들 오프셋과 돌출 부분 값이 변경될 때마다 계산된 모터 위치를 상위로 전달
  useEffect(() => {
    const calculatedPosition = Math.round((needleOffset + needleProtrusion) * 125);
    if (onMotorPositionChange) {
      onMotorPositionChange(calculatedPosition);
    }
  }, [needleOffset, needleProtrusion, onMotorPositionChange])

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

  // 모터 UP 명령 함수 (초기위치 + 돌출부분으로 이동)
  const handleMotorUp = () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    const upPosition = Math.round((needleOffset + needleProtrusion) * 125);
    console.log(`🎯 모터 UP 명령: 초기위치 + 돌출부분 (${needleOffset} + ${needleProtrusion} = ${needleOffset + needleProtrusion}mm, 모터위치: ${upPosition})`);
    sendMotorCommand(upPosition);
  }

  // 모터 DOWN 명령 함수 (초기위치로 이동)
  const handleMotorDown = () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    const downPosition = Math.round(needleOffset * 125);
    console.log(`🎯 모터 DOWN 명령: 초기위치로 이동 (${needleOffset}mm, 모터위치: ${downPosition})`);
    sendMotorCommand(downPosition);
  }

  // 1.0부터 20.0까지 0.1 간격으로 생성
  const needleLengthOptions = Array.from({ length: 191 }, (_, i) => (1 + i * 0.1).toFixed(1))

  return (
    <div style={{ height: '35dvh' }}>
      <Panel title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1dvh' }}>
          <h2 className="text-lg font-bold text-responsive">니들 설정</h2>
          <img
            src={isNeedleCheckEnabled ? unlockIcon : lockIcon}
            alt={isNeedleCheckEnabled ? 'Unlocked' : 'Locked'}
            className="responsive-icon"
            style={{ cursor: 'pointer' }}
            onClick={handleNeedleCheckToggle}
            title={isNeedleCheckEnabled ? '설정 잠금' : '설정 잠금 해제'}
          />
        </div>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8dvh', height: '100%', overflow: 'hidden' }}>
        {/* 니들 오프셋 (mm) */}
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 초기 위치 (mm)</label>
            <Input 
              type="number"
              value={needleOffset}
              onChange={(e) => onNeedleOffsetChange && onNeedleOffsetChange(Number(e.target.value))}
              step="0.01"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '20%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                const motorPosition = Math.round(needleOffset * 125);
                console.log('니들 초기위치 이동:', needleOffset, 'mm, 모터 위치:', motorPosition);
                sendMotorCommand(motorPosition);
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '20%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              ↑
            </Button>
          </div>
        </div>

        {/* 니들 돌출 부분 (mm) */}
        <div style={{ display: 'flex' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 돌출 부분 (mm)</label>
            <Input 
              type="number"
              value={needleProtrusion}
              onChange={(e) => onNeedleProtrusionChange && onNeedleProtrusionChange(Number(e.target.value))}
              step="0.1"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '20%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                const motorPosition = Math.round((needleOffset + needleProtrusion) * 125);
                console.log('니들 돌출 부분 이동:', needleOffset, '+', needleProtrusion, '=', needleOffset + needleProtrusion, 'mm, 모터 위치:', motorPosition);
                sendMotorCommand(motorPosition);
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '20%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              ↑
            </Button>
          </div>
        </div>

        {/* 모터 동작 확인 */}
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>모터 동작 확인</label>
            <Button
              onClick={handleMotorUp}
              disabled={!isMotorConnected}
              style={{
                backgroundColor: '#171C26',
                color: (!isMotorConnected) ? '#D1D5DB' : '#BFB2E4',
                width: '20%',
                fontSize: '1.3dvh', 
                height: '3dvh',
                border: `1px solid ${(!isMotorConnected) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isMotorConnected) ? 'not-allowed' : 'pointer',
                opacity: (!isMotorConnected) ? 0.6 : 1
              }}
            >
              ↑
            </Button>
            <Button
              onClick={handleMotorDown}
              disabled={!isMotorConnected}
              style={{
                backgroundColor: '#171C26',
                color: (!isMotorConnected) ? '#D1D5DB' : '#BFB2E4',
                width: '20%',
                fontSize: '1.3dvh', 
                height: '3dvh',
                border: `1px solid ${(!isMotorConnected) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isMotorConnected) ? 'not-allowed' : 'pointer',
                opacity: (!isMotorConnected) ? 0.6 : 1
              }}
            >
              ↓
            </Button>
          </div>
        </div>

        {/* 니들 기본 속도 */}
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '40%', fontSize: '1.3dvh', color: '#D1D5DB' }}>모터 기본 속도</label>
            <Input 
              type="number"
              value={needleSpeed || 0}
              onChange={(e) => onNeedleSpeedChange && onNeedleSpeedChange(Number(e.target.value))}
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : '#BFB2E4', 
                textAlign: 'center',
                width: '42%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1,
                border: `1px solid ${!isNeedleCheckEnabled ? '#6B7280' : '#BFB2E4'}`
              }}
            />
          </div>
        </div>
        </div>
      </Panel>
    </div>
  )
}
