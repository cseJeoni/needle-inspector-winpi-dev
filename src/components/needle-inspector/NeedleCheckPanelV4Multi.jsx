"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"
import lockIcon from '../../assets/icon/lock.png';
import unlockIcon from '../../assets/icon/unlock.png';

export default function NeedleCheckPanelV4Multi({ 
  mode, 
  isMotorConnected, 
  needlePosition, 
  onNeedleUp, 
  onNeedleDown, 
  websocket, 
  isWsConnected, 
  onMotorPositionChange,
  // 저항 측정 관련 props
  resistance1,
  resistance2,
  resistance1Status,
  resistance2Status,
  isResistanceMeasuring,
  onResistanceMeasuringChange,
  // 모터 2 설정값 props
  needleOffset2,
  needleProtrusion2,
  onNeedleOffset2Change,
  onNeedleProtrusion2Change,
  resistanceDelay,
  onResistanceDelayChange,
  resistanceThreshold,
  onResistanceThresholdChange
}) {
  // 모터 상태에 따라 needleStatus 동기화
  const [needleStatus, setNeedleStatus] = useState(needlePosition === 'UP' ? 'UP' : needlePosition === 'DOWN' ? 'DOWN' : 'MOVING')
  // 버튼에 표시할 텍스트 (다음 동작을 표시, MOVING일 때는 현재 상태 유지)
  const buttonText = needleStatus === 'UP' ? 'DOWN' : needleStatus === 'DOWN' ? 'UP' : (needlePosition === 'UP' ? 'UP' : 'DOWN')

  // 모터 1 (니들 포지셔닝 모터) 설정
  const [needleOffset1, setNeedleOffset1] = useState(0.1)
  const [needleProtrusion1, setNeedleProtrusion1] = useState(3.0)
  const [repeatCount1, setRepeatCount1] = useState(1)
  
  // 모터 2 (저항 측정 모터) 설정 - props에서 받아옴
  const [repeatCount2, setRepeatCount2] = useState(1)
  
  // 니들 설정 활성화 상태 (기본값: 비활성화)
  const [isNeedleCheckEnabled, setIsNeedleCheckEnabled] = useState(false)
  // 저항 검사 설정 활성화 상태 (기본값: 비활성화)
  const [isResistanceCheckEnabled, setIsResistanceCheckEnabled] = useState(false)
  // 니들 소음 확인 상태
  const [isNeedleNoiseChecking, setIsNeedleNoiseChecking] = useState(false)
  
  // 저항 측정 상태는 props로 받음 (로컬 상태 제거)
  
  // 저항 검사 설정 상태 - resistanceDelay, resistanceThreshold는 props로 받아옴
  const [normalRangeMin, setNormalRangeMin] = useState(0)
  const [normalRangeMax, setNormalRangeMax] = useState(100)

  // WebSocket을 통한 모터 위치 명령 전송 함수 (모터 ID 포함)
  const sendMotorCommand = (targetPosition, motorId = 1) => {
    if (!websocket || !isWsConnected) {
      console.log('WebSocket 연결되지 않음. 모터 명령 전송 실패:', targetPosition, 'Motor ID:', motorId);
      return;
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "position",
      motor_id: motorId
    }

    console.log(`모터 ${motorId} 위치 명령 전송:`, msg);
    websocket.send(JSON.stringify(msg));
  }
  
  // 모터 1 니들 오프셋과 돌출 부분의 UP/DOWN 상태 (기본값: UP)
  const [needleOffsetState1, setNeedleOffsetState1] = useState('UP')
  const [needleProtrusionState1, setNeedleProtrusionState1] = useState('UP')
  
  // 모터 2 니들 오프셋과 돌출 부분의 UP/DOWN 상태 (기본값: UP)
  const [needleOffsetState2, setNeedleOffsetState2] = useState('UP')
  const [needleProtrusionState2, setNeedleProtrusionState2] = useState('UP')
  
  // 니들 설정 잠금/해제 토글 함수
  const handleNeedleCheckToggle = () => {
    setIsNeedleCheckEnabled(!isNeedleCheckEnabled)
  }

  // 저항 검사 설정 잠금/해제 토글 함수
  const handleResistanceCheckToggle = () => {
    setIsResistanceCheckEnabled(!isResistanceCheckEnabled)
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

  // 모터 1 니들 오프셋과 돌출 부분 값이 변경될 때마다 계산된 모터 위치를 상위로 전달
  useEffect(() => {
    const calculatedPosition = Math.round((needleOffset1 + needleProtrusion1) * 100);
    if (onMotorPositionChange) {
      onMotorPositionChange(calculatedPosition);
    }
  }, [needleOffset1, needleProtrusion1, onMotorPositionChange])
  
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

  const handleUpDown = async () => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    if (needleStatus === 'MOVING') {
      console.error("❌ 니들이 이미 움직이고 있습니다.")
      return
    }

    console.log(`🔄 니들 UP & DOWN ${repeatCount1}회 시작 (명령어 큐 방식)`)
    
    for (let i = 0; i < repeatCount1; i++) {
      console.log(`🔄 ${i + 1}/${repeatCount1} 사이클 시작`)
      
      // UP 명령 (840)
      console.log("🎯 니들 UP 명령 실행 (840)")
      onNeedleUp()
      
      // UP 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // DOWN 명령 (0)
      console.log("🎯 니들 DOWN 명령 실행 (0)")
      onNeedleDown()
      
      // DOWN 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // 다음 사이클 전 잠시 대기
      if (i < repeatCount1 - 1) {
        console.log(`⏳ 다음 사이클 대기 중...`)
        await new Promise(resolve => setTimeout(resolve, 90))
      }
    }
    
    console.log(`✅ 니들 UP & DOWN ${repeatCount1}회 완료`)
  }

  // 듀얼 모터용 UP & DOWN 함수
  const handleUpDownMotor = async (motorId, repeatCount) => {
    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      return
    }

    if (needleStatus === 'MOVING') {
      console.error("❌ 니들이 이미 움직이고 있습니다.")
      return
    }

    console.log(`🔄 모터${motorId} UP & DOWN ${repeatCount}회 시작`)
    
    for (let i = 0; i < repeatCount; i++) {
      console.log(`🔄 모터${motorId} ${i + 1}/${repeatCount} 사이클 시작`)
      
      // UP 명령 (840)
      console.log(`🎯 모터${motorId} UP 명령 실행 (840)`)
      sendMotorCommand(840, motorId)
      
      // UP 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // DOWN 명령 (0)
      console.log(`🎯 모터${motorId} DOWN 명령 실행 (0)`)
      sendMotorCommand(0, motorId)
      
      // DOWN 동작 완료 대기 (고정 시간)
      await new Promise(resolve => setTimeout(resolve, 90))
      
      // 다음 사이클 전 잠시 대기
      if (i < repeatCount - 1) {
        console.log(`⏳ 모터${motorId} 다음 사이클 대기 중...`)
        await new Promise(resolve => setTimeout(resolve, 90))
      }
    }
    
    console.log(`✅ 모터${motorId} UP & DOWN ${repeatCount}회 완료`)
  }

  // 저항 측정 함수
  const measureResistance = () => {
    if (!websocket || !isWsConnected) {
      console.log('WebSocket 연결되지 않음. 저항 측정 실패');
      return;
    }

    if (onResistanceMeasuringChange) {
      onResistanceMeasuringChange(true);
    }
    
    const msg = {
      cmd: "measure_resistance"
    };
    
    console.log('저항 측정 명령 전송:', msg);
    websocket.send(JSON.stringify(msg));
  };

  // 저항 측정 버튼 클릭 함수
  const handleResistanceMeasure = () => {
    if (!websocket || !isWsConnected) {
      console.error('❌ WebSocket에 연결되지 않았습니다.');
      return;
    }

    if (isResistanceMeasuring) {
      console.log('⏳ 이미 저항 측정 중입니다.');
      return;
    }

    console.log('🔍 저항 측정 시작');
    measureResistance();
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5dvh', height: '100%', overflow: 'hidden' }}>
        
        {/* 니들 오프셋 (mm) - 듀얼 모터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5dvw' }}>
          <label style={{ width: '35%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 초기 위치 (mm)</label>
          
          {/* 모터 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={needleOffset1}
              onChange={(e) => setNeedleOffset1(Number(e.target.value))}
              step="0.01"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleOffsetState1 === 'UP') {
                  const motorPosition = Math.round(needleOffset1 * 100);
                  console.log('모터1 니들 오프셋 UP:', needleOffset1, '모터 위치:', motorPosition);
                  sendMotorCommand(motorPosition, 1);
                  setNeedleOffsetState1('DOWN');
                } else {
                  console.log('모터1 니들 오프셋 DOWN: 모터 위치 0');
                  sendMotorCommand(0, 1);
                  setNeedleOffsetState1('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleOffsetState1 === 'UP' ? '↑' : '↓'}
            </Button>
          </div>
          
          {/* 모터 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={needleOffset2}
              onChange={(e) => onNeedleOffset2Change && onNeedleOffset2Change(Number(e.target.value))}
              step="0.01"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleOffsetState2 === 'UP') {
                  const motorPosition = Math.round(needleOffset2 * 100);
                  console.log('모터2 니들 오프셋 UP:', needleOffset2, '모터 위치:', motorPosition);
                  sendMotorCommand(motorPosition, 2);
                  setNeedleOffsetState2('DOWN');
                } else {
                  console.log('모터2 니들 오프셋 DOWN: 모터 위치 0');
                  sendMotorCommand(0, 2);
                  setNeedleOffsetState2('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#DCD7DE' : '#E6C2D9',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#DCD7DE' : '#E6C2D9'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleOffsetState2 === 'UP' ? '↑' : '↓'}
            </Button>
          </div>
        </div>

        {/* 니들 돌출 부분 (mm) - 듀얼 모터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5dvw' }}>
          <label style={{ width: '35%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 돌출 부분 (mm)</label>
          
          {/* 모터 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={needleProtrusion1}
              onChange={(e) => setNeedleProtrusion1(Number(e.target.value))}
              step="0.1"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleProtrusionState1 === 'UP') {
                  const motorPosition = Math.round((needleOffset1 + needleProtrusion1) * 100);
                  console.log('모터1 니들 돌출 부분 UP:', needleOffset1, '+', needleProtrusion1, '=', needleOffset1 + needleProtrusion1, '모터 위치:', motorPosition);
                  sendMotorCommand(motorPosition, 1);
                  setNeedleProtrusionState1('DOWN');
                } else {
                  console.log('모터1 니들 돌출 부분 DOWN: 모터 위치 0');
                  sendMotorCommand(0, 1);
                  setNeedleProtrusionState1('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#D1D5DB' : '#BFB2E4',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleProtrusionState1 === 'UP' ? '↑' : '↓'}
            </Button>
          </div>
          
          {/* 모터 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={needleProtrusion2}
              onChange={(e) => onNeedleProtrusion2Change && onNeedleProtrusion2Change(Number(e.target.value))}
              step="0.1"
              min="0"
              disabled={!isNeedleCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isNeedleCheckEnabled ? '#D1D5DB' : 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isNeedleCheckEnabled ? 0.6 : 1
              }}
            />
            <Button
              onClick={() => {
                if (needleProtrusionState2 === 'UP') {
                  const motorPosition = Math.round((needleOffset2 + needleProtrusion2) * 100);
                  console.log('모터2 니들 돌출 부분 UP:', needleOffset2, '+', needleProtrusion2, '=', needleOffset2 + needleProtrusion2, '모터 위치:', motorPosition);
                  sendMotorCommand(motorPosition, 2);
                  setNeedleProtrusionState2('DOWN');
                } else {
                  console.log('모터2 니들 돌출 부분 DOWN: 모터 위치 0');
                  sendMotorCommand(0, 2);
                  setNeedleProtrusionState2('UP');
                }
              }}
              disabled={!isNeedleCheckEnabled}
              style={{
                backgroundColor: '#171C26',
                color: (!isNeedleCheckEnabled) ? '#DCD7DE' : '#E6C2D9',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isNeedleCheckEnabled) ? '#DCD7DE' : '#E6C2D9'}`,
                borderRadius: '0.375rem',
                cursor: (!isNeedleCheckEnabled) ? 'not-allowed' : 'pointer',
                opacity: (!isNeedleCheckEnabled) ? 0.6 : 1
              }}
            >
              {needleProtrusionState2 === 'UP' ? '↑' : '↓'}
            </Button>
          </div>
        </div>

        {/* 니들 소음 확인 - 듀얼 모터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5dvw' }}>
          <label style={{ width: '35%', fontSize: '1.3dvh', color: '#D1D5DB' }}>니들 소음 확인</label>
          
          {/* 모터 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={repeatCount1}
              onChange={(e) => setRepeatCount1(Number(e.target.value))}
              min={1}
              disabled={false}
              style={{ 
                backgroundColor: '#171C26', 
                color: 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: 1
              }}
            />
            <Button
              onClick={() => handleUpDownMotor(1, repeatCount1)}
              disabled={!isMotorConnected || needleStatus === 'MOVING'}
              style={{
                backgroundColor: '#171C26',
                color: (!isMotorConnected) ? '#D1D5DB' : '#BFB2E4',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isMotorConnected) ? '#6B7280' : '#BFB2E4'}`,
                borderRadius: '0.375rem',
                cursor: (!isMotorConnected || needleStatus === 'MOVING') ? 'not-allowed' : 'pointer',
                opacity: (!isMotorConnected || needleStatus === 'MOVING') ? 0.6 : 1
              }}
            >
              ↑
            </Button>
          </div>
          
          {/* 모터 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
            <Input 
              type="number"
              value={repeatCount2}
              onChange={(e) => setRepeatCount2(Number(e.target.value))}
              min={1}
              disabled={false}
              style={{ 
                backgroundColor: '#171C26', 
                color: 'white', 
                textAlign: 'center',
                width: '60%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: 1
              }}
            />
            <Button
              onClick={() => handleUpDownMotor(2, repeatCount2)}
              disabled={!isMotorConnected || needleStatus === 'MOVING'}
              style={{
                backgroundColor: '#171C26',
                color: (!isMotorConnected) ? '#DCD7DE' : '#E6C2D9',
                width: '30%',
                fontSize: '1.3dvh',
                height: '3dvh',
                border: `1px solid ${(!isMotorConnected) ? '#DCD7DE' : '#E6C2D9'}`,
                borderRadius: '0.375rem',
                cursor: (!isMotorConnected || needleStatus === 'MOVING') ? 'not-allowed' : 'pointer',
                opacity: (!isMotorConnected || needleStatus === 'MOVING') ? 0.6 : 1
              }}
            >
            ↑
            </Button>
          </div>
        </div>

        {/* 저항 검사 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5dvh', color: '#D1D5DB' }}>
          {/* 저항검사 제목과 자물쇠 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '1.5dvh', marginBottom: '0.5dvh' }}>
            <h2 className="text-lg font-bold text-responsive">저항 검사</h2>
            <img
              src={isResistanceCheckEnabled ? unlockIcon : lockIcon}
              alt={isResistanceCheckEnabled ? 'Unlocked' : 'Locked'}
              className="responsive-icon"
              style={{ cursor: 'pointer' }}
              onClick={handleResistanceCheckToggle}
              title={isResistanceCheckEnabled ? '설정 잠금' : '설정 잠금 해제'}
            />
          </div>
          
          {/* DELAY, 정상 범주 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontSize: '1.3dvh', color: '#D1D5DB', minWidth: '10%' }}>DELAY (ms)</label>
            <Input 
              type="number"
              value={resistanceDelay}
              onChange={(e) => onResistanceDelayChange && onResistanceDelayChange(Number(e.target.value))}
              min="0"
              step="100"
              disabled={!isResistanceCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isResistanceCheckEnabled ? '#D1D5DB' : 'white',
                textAlign: 'center',
                width: '20%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isResistanceCheckEnabled ? 0.6 : 1
              }}
            />
            <label style={{ fontSize: '1.3dvh', color: '#D1D5DB', minWidth: '12%' }}>정상 값</label>
            <Input 
              type="number"
              value={resistanceThreshold}
              onChange={(e) => onResistanceThresholdChange && onResistanceThresholdChange(Number(e.target.value))}
              min="0"
              step="1"
              placeholder="정상값"
              disabled={!isResistanceCheckEnabled}
              style={{ 
                backgroundColor: '#171C26', 
                color: !isResistanceCheckEnabled ? '#D1D5DB' : 'white',
                textAlign: 'center',
                width: '22%',
                fontSize: '1.1dvh', 
                height: '3dvh',
                opacity: !isResistanceCheckEnabled ? 0.6 : 1
              }}
            />
            <span style={{ fontSize: '1.3dvh', color: '#D1D5DB' }}>Ω</span>
          </div>
          
          {/* 저항1, 저항2 한 줄에 표시 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* 저항1 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
              <label style={{ fontSize: '1.3dvh', color: '#D1D5DB', minWidth: '15%' }}>저항 1</label>
              <Input 
                type="text"
                value={isNaN(resistance1) ? 'NaN' : (0.001 * resistance1).toFixed(3)}
                readOnly
                style={{ 
                  backgroundColor: '#171C26', 
                  color: resistance1Status === 'OK' ? '#10B981' : (resistance1Status === 'ERROR' || resistance1Status === 'read_FAIL') ? '#EF4444' : '#D1D5DB',
                  textAlign: 'center',
                  width: '50%',
                  fontSize: '1.3dvh', 
                  height: '3dvh',
                  border: `1px solid ${resistance1Status === 'OK' ? '#10B981' : (resistance1Status === 'ERROR' || resistance1Status === 'read_FAIL') ? '#EF4444' : '#6B7280'}`
                }}
              />
              <span style={{ 
                fontSize: '1.3dvh', 
                color: resistance1Status === 'OK' ? '#10B981' : (resistance1Status === 'ERROR' || resistance1Status === 'read_FAIL') ? '#EF4444' : '#D1D5DB',
                minWidth: '3%'
              }}>Ω</span>
            </div>
            
            {/* 저항2 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3dvw', flex: 1 }}>
              <label style={{ fontSize: '1.3dvh', color: '#D1D5DB', minWidth: '15%' }}>저항 2</label>
              <Input 
                type="text"
                value={isNaN(resistance2) ? 'NaN' : (0.001 * resistance2).toFixed(3)}
                readOnly
                style={{ 
                  backgroundColor: '#171C26', 
                  color: resistance2Status === 'OK' ? '#10B981' : (resistance2Status === 'ERROR' || resistance2Status === 'read_FAIL') ? '#EF4444' : '#D1D5DB',
                  textAlign: 'center',
                  width: '50%',
                  fontSize: '1.3dvh', 
                  height: '3dvh',
                  border: `1px solid ${resistance2Status === 'OK' ? '#10B981' : (resistance2Status === 'ERROR' || resistance2Status === 'read_FAIL') ? '#EF4444' : '#6B7280'}`
                }}
              />
              <span style={{ 
                fontSize: '1.3dvh', 
                color: resistance2Status === 'OK' ? '#10B981' : (resistance2Status === 'ERROR' || resistance2Status === 'read_FAIL') ? '#EF4444' : '#D1D5DB',
                minWidth: '3%'
              }}>Ω</span>
            </div>
            
            {/* 측정 버튼 */}
            <Button
              onClick={handleResistanceMeasure}
              disabled={!isWsConnected || isResistanceMeasuring}
              style={{
                backgroundColor: '#171C26',
                color: '#10B981',
                fontSize: '1.3dvh',
                height: '3dvh',
                padding: '0 1dvw',
                border: '1px solid #10B981',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                minWidth: '8%'
              }}
            >
              측정
            </Button>
          </div>

        </div>
        </div>
      </Panel>
    </div>
  )
}
