import { useState, useRef, useEffect } from "react"
import CameraView from "./CameraView"
import StatusPanel from "./StatusPanel"
import DataSettingsPanel from "./DataSettingsPanel"
import NeedleCheckPanel from "./NeedleCheckPanel"
import ModePanel from "./ModePanel"
import "../../css/NeedleInspector.css"

const PX_TO_MM = 1 / 3.78; // 1px 당 mm

// 모터 연결 기본 설정값
const MOTOR_CONFIG = {
  device: 'usb-motor',
  baudrate: 19200,
  parity: 'none',
  dataBits: 8,
  stopBits: 1
};

export default function NeedleInspectorUI() {
  const [mode, setMode] = useState("생산")
  
  // 비디오 서버 URL (실제 환경에 맞게 수정 필요)
  const videoServerUrl = "http://localhost:5000"
  
  // 모터 관련 상태
  const [ws, setWs] = useState(null)
  const [isWsConnected, setIsWsConnected] = useState(false)
  const [isMotorConnected, setIsMotorConnected] = useState(false)
  const [motorError, setMotorError] = useState(null)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [needlePosition, setNeedlePosition] = useState('UNKNOWN') // UP, DOWN, UNKNOWN
  
  // Camera 1 상태
  const [drawMode1, setDrawMode1] = useState(false)
  const [selectedIndex1, setSelectedIndex1] = useState(-1)
  const [lineInfo1, setLineInfo1] = useState('선 정보: 없음')
  const canvasRef1 = useRef(null)
  const videoContainerRef1 = useRef(null)

  // Camera 2 상태
  const [drawMode2, setDrawMode2] = useState(false)
  const [selectedIndex2, setSelectedIndex2] = useState(-1)
  const [lineInfo2, setLineInfo2] = useState('선 정보: 없음')
  const canvasRef2 = useRef(null)
  const videoContainerRef2 = useRef(null)

  // 공통 상태
  const [lines1, setLines1] = useState([])
  const [lines2, setLines2] = useState([])
  const [isDrawing1, setIsDrawing1] = useState(false)
  const [isDrawing2, setIsDrawing2] = useState(false)
  const [startPoint1, setStartPoint1] = useState(null)
  const [startPoint2, setStartPoint2] = useState(null)

  // 마우스 위치 계산 함수
  const getMousePos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  // 선 그리기 및 정보 표시 함수
  const drawLineWithInfo = (ctx, line, color, showText) => {
    const { x1, y1, x2, y2 } = line
    
    // ctx가 null이 아닐 때만 그리기 실행
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      if (showText) {
        ctx.fillStyle = color
        ctx.font = '14px Arial'
        const dx = x2 - x1
        const dy = y2 - y1
        const length = Math.sqrt(dx * dx + dy * dy)
        const mm = length * PX_TO_MM
        let angle = Math.atan2(dy, dx) * 180 / Math.PI
        ctx.fillText(`${mm.toFixed(1)}mm (${angle.toFixed(1)}°)`, (x1 + x2) / 2 + 5, (y1 + y2) / 2 - 5)
      }
    }

    // 계산은 항상 수행 (ctx가 null이어도)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const mm = length * PX_TO_MM
    let angle = Math.atan2(dy, dx) * 180 / Math.PI

    return { length: length.toFixed(1), mm: mm.toFixed(2), angle: angle.toFixed(2) }
  }

  // 각도 스냅 함수
  const snapAngle = (startPos, currentPos) => {
    const dx = currentPos.x - startPos.x
    const dy = currentPos.y - startPos.y
    const angle = Math.atan2(dy, dx) * 180 / Math.PI
    const snapThreshold = 5

    let endX = currentPos.x
    let endY = currentPos.y

    // 0도, 180도 (수평선)
    if (Math.abs(angle) < snapThreshold || Math.abs(Math.abs(angle) - 180) < snapThreshold) {
      endY = startPos.y
    }
    // 90도, -90도 (수직선)
    else if (Math.abs(Math.abs(angle) - 90) < snapThreshold) {
      endX = startPos.x
    }

    return { x: endX, y: endY }
  }

  // 선 클릭 감지 함수
  const isPointOnLine = (point, line, tolerance = 10) => {
    const { x1, y1, x2, y2 } = line
    const { x, y } = point

    // 선분의 길이
    const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (lineLength === 0) return false

    // 점에서 선분까지의 거리 계산
    const distance = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / lineLength

    // 점이 선분의 범위 내에 있는지 확인
    const dotProduct = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (lineLength ** 2)
    const isInRange = dotProduct >= 0 && dotProduct <= 1

    return distance <= tolerance && isInRange
  }

  // Camera 1 핸들러들
  const handlers1 = {
    handleMouseDown: (e) => {
      const pos = getMousePos(canvasRef1.current, e)
      
      if (drawMode1) {
        setStartPoint1(pos)
        setIsDrawing1(true)
        return
      }

      // 선 클릭 감지
      for (let i = lines1.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines1[i])) {
          setSelectedIndex1(i)
          const lineData = drawLineWithInfo(null, lines1[i], 'blue', false)
          setLineInfo1(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas1()
          return
        }
      }
      setSelectedIndex1(-1)
      setLineInfo1('선 정보: 없음')
      redrawCanvas1()
    },
    handleMouseMove: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      const currentPos = getMousePos(canvasRef1.current, e)
      const snappedPos = snapAngle(startPoint1, currentPos)
      
      const canvas = canvasRef1.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines1, selectedIndex1)
      
      // 임시 선 그리기
      const tempLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y }
      drawLineWithInfo(ctx, tempLine, 'orange', true)
    },
    handleMouseUp: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      const currentPos = getMousePos(canvasRef1.current, e)
      const snappedPos = snapAngle(startPoint1, currentPos)
      
      const newLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y }
      const newLines = [...lines1, newLine]
      setLines1(newLines)
      
      setIsDrawing1(false)
      setStartPoint1(null)
      setDrawMode1(false)
      setSelectedIndex1(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, 'blue', false)
      setLineInfo1(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex1 >= 0 && selectedIndex1 < lines1.length) {
        const newLines = lines1.filter((_, index) => index !== selectedIndex1)
        setLines1(newLines)
        setSelectedIndex1(-1)
        setLineInfo1('선 정보: 없음')
        redrawCanvas1()
      }
    }
  }

  // Camera 2 핸들러들
  const handlers2 = {
    handleMouseDown: (e) => {
      const pos = getMousePos(canvasRef2.current, e)
      
      if (drawMode2) {
        setStartPoint2(pos)
        setIsDrawing2(true)
        return
      }

      // 선 클릭 감지
      for (let i = lines2.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines2[i])) {
          setSelectedIndex2(i)
          const lineData = drawLineWithInfo(null, lines2[i], 'blue', false)
          setLineInfo2(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas2()
          return
        }
      }
      setSelectedIndex2(-1)
      setLineInfo2('선 정보: 없음')
      redrawCanvas2()
    },
    handleMouseMove: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      const currentPos = getMousePos(canvasRef2.current, e)
      const snappedPos = snapAngle(startPoint2, currentPos)
      
      const canvas = canvasRef2.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines2, selectedIndex2)
      
      // 임시 선 그리기
      const tempLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y }
      drawLineWithInfo(ctx, tempLine, 'orange', true)
    },
    handleMouseUp: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      const currentPos = getMousePos(canvasRef2.current, e)
      const snappedPos = snapAngle(startPoint2, currentPos)
      
      const newLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y }
      const newLines = [...lines2, newLine]
      setLines2(newLines)
      
      setIsDrawing2(false)
      setStartPoint2(null)
      setDrawMode2(false)
      setSelectedIndex2(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, 'blue', false)
      setLineInfo2(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex2 >= 0 && selectedIndex2 < lines2.length) {
        const newLines = lines2.filter((_, index) => index !== selectedIndex2)
        setLines2(newLines)
        setSelectedIndex2(-1)
        setLineInfo2('선 정보: 없음')
        redrawCanvas2()
      }
    }
  }

  // 선 그리기 헬퍼 함수
  const drawLines = (ctx, lines, selectedIndex) => {
    lines.forEach((line, index) => {
      const isSelected = index === selectedIndex
      drawLineWithInfo(ctx, line, isSelected ? 'cyan' : 'red', isSelected)
    })
  }

  // 캔버스 다시 그리기 함수들
  const redrawCanvas1 = () => {
    const canvas = canvasRef1.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines1, selectedIndex1)
  }

  const redrawCanvas2 = () => {
    const canvas = canvasRef2.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines2, selectedIndex2)
  }

  // 캔버스 리사이즈 함수
  const resizeCanvas = (canvas, container) => {
    if (canvas && container) {
      canvas.width = container.offsetWidth
      canvas.height = container.offsetHeight
    }
  }

  const resizeAll = () => {
    resizeCanvas(canvasRef1.current, videoContainerRef1.current)
    resizeCanvas(canvasRef2.current, videoContainerRef2.current)
    
    redrawCanvas1()
    redrawCanvas2()
  }

  useEffect(() => {
    redrawCanvas1()
  }, [lines1, selectedIndex1])

  useEffect(() => {
    redrawCanvas2()
  }, [lines2, selectedIndex2])

  // 모터 WebSocket 연결 및 자동 연결
  useEffect(() => {
    console.log('🔧 모터 WebSocket 연결 시도...')
    const socket = new WebSocket("ws://192.168.0.82:8765")

    socket.onopen = () => {
      console.log("✅ 모터 WebSocket 연결 성공")
      setIsWsConnected(true)
      setMotorError(null)
      
      // WebSocket 연결 후 자동으로 모터 연결 시도
      setTimeout(() => {
        connectMotor(socket)
      }, 1000)
    }

    socket.onclose = () => {
      console.log("❌ 모터 WebSocket 연결 끊김")
      setIsWsConnected(false)
      setIsMotorConnected(false)
      setMotorError("WebSocket 연결이 끊어졌습니다.")
    }

    socket.onerror = (err) => {
      console.error("❌ 모터 WebSocket 오류:", err)
      setMotorError("WebSocket 연결 오류가 발생했습니다.")
    }

    socket.onmessage = (e) => {
      try {
        const res = JSON.parse(e.data)
        console.log("📨 모터 응답:", res)

        if (res.type === "serial") {
          if (res.result.includes("성공") || 
              res.result.includes("완료") || 
              res.result.includes("전송 완료")) {
            console.log("✅ 모터 연결 성공")
            setIsMotorConnected(true)
            setMotorError(null)
          } else if (res.result.includes("실패") || 
                     res.result.includes("오류")) {
            console.error("❌ 모터 연결 실패:", res.result)
            setIsMotorConnected(false)
            setMotorError(res.result)
          }
        } else if (res.type === "status") {
          // 상태 업데이트
          const { position } = res.data
          setCurrentPosition(position)
          
          // 니들 위치 판단 (840: UP, 0: DOWN)
          if (position >= 800) {
            setNeedlePosition('UP')
          } else if (position <= 50) {
            setNeedlePosition('DOWN')
          } else {
            setNeedlePosition('MOVING')
          }
          
          console.log("📊 모터 위치 업데이트:", position)
        } else if (res.type === "error") {
          console.error("❌ 모터 오류:", res.result)
          setMotorError(res.result)
        }
      } catch (err) {
        console.error("❌ 모터 메시지 파싱 오류:", err)
      }
    }

    setWs(socket)

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        console.log("🔧 모터 포트 닫기 및 WebSocket 연결 종료...")
        socket.send(JSON.stringify({ cmd: "disconnect" }))
        setTimeout(() => {
          socket.close()
          console.log("✅ 모터 연겴 정리 완료")
        }, 500)
      }
    }
  }, [])

  // 앱 종료 시 정리 (window beforeunload 이벤트)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log("🔧 앱 종료 - 모터 포트 닫기...")
        ws.send(JSON.stringify({ cmd: "disconnect" }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [ws])

  // 모터 자동 연결 함수
  const connectMotor = (socket) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket이 연결되지 않았습니다.")
      setMotorError("WebSocket이 연결되지 않았습니다.")
      return
    }

    const msg = {
      cmd: "connect",
      port: MOTOR_CONFIG.device,
      baudrate: MOTOR_CONFIG.baudrate,
      parity: MOTOR_CONFIG.parity,
      databits: MOTOR_CONFIG.dataBits,
      stopbits: MOTOR_CONFIG.stopBits,
    }

    console.log("🔧 모터 자동 연결 시도:", msg)
    socket.send(JSON.stringify(msg))
  }

  // 니들 위치 제어 함수
  const handleNeedlePosition = (targetPosition) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket이 연결되지 않았습니다.")
      setMotorError("WebSocket이 연결되지 않았습니다.")
      return
    }

    if (!isMotorConnected) {
      console.error("❌ 모터가 연결되지 않았습니다.")
      setMotorError("모터가 연결되지 않았습니다.")
      return
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "position",
    }

    console.log(`🎯 니들 ${targetPosition === 840 ? 'UP' : 'DOWN'} 명령 전송:`, msg)
    ws.send(JSON.stringify(msg))
    setMotorError(null)
  }

  // 니들 UP 함수
  const handleNeedleUp = () => {
    handleNeedlePosition(840)
  }

  // 니들 DOWN 함수
  const handleNeedleDown = () => {
    handleNeedlePosition(0)
  }

  useEffect(() => {
    const img1 = document.querySelector('#camera-feed-1 img')
    const img2 = document.querySelector('#camera-feed-2 img')

    window.addEventListener('resize', resizeAll)
    if (img1) img1.addEventListener('load', resizeAll)
    if (img2) img2.addEventListener('load', resizeAll)

    setTimeout(resizeAll, 100)

    return () => {
      window.removeEventListener('resize', resizeAll)
      if (img1) img1.removeEventListener('load', resizeAll)
      if (img2) img2.removeEventListener('load', resizeAll)
    }
  }, [])

  return (
    <div className="bg-[#171C26] min-h-screen text-white font-sans p-4 flex flex-col gap-4">
      {/* 모터 연결 상태 표시 */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000
      }}>
        <div style={{
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: isMotorConnected ? '#d4edda' : '#f8d7da',
          color: isMotorConnected ? '#155724' : '#721c24',
          border: `1px solid ${isMotorConnected ? '#c3e6cb' : '#f5c6cb'}`,
          textAlign: 'center'
        }}>
          모터: {isMotorConnected ? '연결됨' : '연결 안됨'}
          <div style={{ fontSize: '10px', marginTop: '2px' }}>
            위치: {currentPosition} | 니들: {needlePosition}
          </div>
          {motorError && (
            <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>
              {motorError}
            </div>
          )}
        </div>
      </div>
      
      <main className="flex flex-col flex-1 gap-4">
        {/* Top Camera Views */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[60vh]">
          <CameraView 
            title="Camera 1" 
            cameraId={1}
            videoServerUrl={videoServerUrl}
            videoEndpoint="/video"
            drawMode={drawMode1}
            onDrawModeToggle={() => setDrawMode1(!drawMode1)}
            onDeleteLine={handlers1.handleDeleteLine}
            selectedIndex={selectedIndex1}
            lineInfo={lineInfo1}
            handlers={handlers1}
            canvasRef={canvasRef1}
            videoContainerRef={videoContainerRef1}
          />
          <CameraView 
            title="Camera 2" 
            cameraId={2}
            videoServerUrl={videoServerUrl}
            videoEndpoint="/video2"
            drawMode={drawMode2}
            onDrawModeToggle={() => setDrawMode2(!drawMode2)}
            onDeleteLine={handlers2.handleDeleteLine}
            selectedIndex={selectedIndex2}
            lineInfo={lineInfo2}
            handlers={handlers2}
            canvasRef={canvasRef2}
            videoContainerRef={videoContainerRef2}
          />
        </div>

        {/* Bottom Control Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
          <StatusPanel mode={mode} />
          <DataSettingsPanel />
          <NeedleCheckPanel 
            mode={mode} 
            isMotorConnected={isMotorConnected}
            needlePosition={needlePosition}
            onNeedleUp={handleNeedleUp}
            onNeedleDown={handleNeedleDown}
          />
          <ModePanel mode={mode} setMode={setMode} />
        </div>
      </main>
      <footer className="text-right text-xs text-gray-400 pr-2">SAVE MODE v1</footer>
    </div>
  )
}
