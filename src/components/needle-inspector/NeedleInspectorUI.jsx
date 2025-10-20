import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import CameraView from "./CameraView"
import StatusPanel from "./StatusPanel"
import DataSettingsPanel from "./DataSettingsPanel"
import NeedleCheckPanel from "./NeedleCheckPanel"
import NeedleCheckPanelV4Multi from "./NeedleCheckPanelV4Multi"
import ModePanel from "./ModePanel"
import JudgePanel from "./JudgePanel" // Import JudgePanel
import { useAuth } from "../../hooks/useAuth.jsx" // Firebase 사용자 정보
import "../../css/NeedleInspector.css"

const PX_TO_MM = 1 / 3.78; // 1px 당 mm

// 모터 연결 기본 설정값
const MOTOR_CONFIG = {
  device: 'usb-motor',
  baudrate: 57600,
  parity: 'none',
  dataBits: 8,
  stopBits: 1
};

export default function NeedleInspectorUI() {
  const [mode, setMode] = useState("생산")
  const [makerCode, setMakerCode] = useState("4")
  
  // Firebase 사용자 정보
  const { user } = useAuth()
  
  // 비디오 서버 URL (실제 환경에 맞게 수정 필요)
  const videoServerUrl = "http://localhost:5000"
  
  // 모터 관련 상태
  const [ws, setWs] = useState(null)
  const [isWsConnected, setIsWsConnected] = useState(false)
  
  // 모터 1 상태
  const [isMotorConnected, setIsMotorConnected] = useState(false)
  const [motorError, setMotorError] = useState(null)
  const [currentPosition, setCurrentPosition] = useState(0)
  const [needlePosition, setNeedlePosition] = useState('UNKNOWN') // UP, DOWN, UNKNOWN
  const [calculatedMotorPosition, setCalculatedMotorPosition] = useState(387) // (니들 오프셋 + 돌출 부분) * 125 기본값: (0.1 + 3.0) * 125 = 387
  
  // 모터 2 상태 추가
  const [isMotor2Connected, setIsMotor2Connected] = useState(false)
  const [motor2Error, setMotor2Error] = useState(null)
  const [currentPosition2, setCurrentPosition2] = useState(0)
  const [motor2Position, setMotor2Position] = useState(0) // 실시간 모터2 위치
  const [needlePosition2, setNeedlePosition2] = useState('UNKNOWN') // UP, DOWN, UNKNOWN

  // 디버깅 패널 관련 상태
  const [isDebugMode, setIsDebugMode] = useState(false) // 디버깅 모드 ON/OFF 상태
  const [debugPanelPosition, setDebugPanelPosition] = useState({ x: 0, y: 520 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  // GPIO 5번 관련 상태 (Short 체크용)
  const [gpio5State, setGpio5State] = useState('LOW') // HIGH, LOW (초기값 LOW로 설정)
  const prevGpio5Ref = useRef('LOW') // 이전 GPIO 상태 추적용 (useRef로 즉시 업데이트)
  
  // GPIO 6번, 13번, 19번 상태 (디버깅용)
  const [gpio6State, setGpio6State] = useState('UNKNOWN') // START 버튼
  const [gpio13State, setGpio13State] = useState('UNKNOWN') // PASS 버튼
  const [gpio19State, setGpio19State] = useState('UNKNOWN') // NG 버튼
  
  // StatusPanel 상태 관리
  const [workStatus, setWorkStatus] = useState('waiting') // waiting, connected, disconnected, write_success, write_failed, needle_short
  
  // DataSettingsPanel 상태 관리
  const [isStarted, setIsStarted] = useState(false) // START/STOP 상태
  const [readEepromData, setReadEepromData] = useState(null) // EEPROM 읽기 데이터
  const [mtrVersion, setMtrVersion] = useState('2.0') // MTR 버전 상태
  const [selectedNeedleType, setSelectedNeedleType] = useState('') // 선택된 니들 타입 상태
  const [needleTipConnected, setNeedleTipConnected] = useState(false) // GPIO23 기반 니들팁 연결 상태
  const [isWaitingEepromRead, setIsWaitingEepromRead] = useState(false) // EEPROM 읽기 응답 대기 상태

  // 모터 1 설정값 (NeedleCheckPanel에서 사용)
  const [needleOffset1, setNeedleOffset1] = useState(4.5) // 모터 1 니들 오프셋
  const [needleProtrusion1, setNeedleProtrusion1] = useState(3.0) // 모터 1 니들 돌출부분
  
  // 모터 2 설정값 (NeedleCheckPanelV4에서 사용)
  const [needleOffset2, setNeedleOffset2] = useState(50) // 모터 2 니들 오프셋
  const [needleProtrusion2, setNeedleProtrusion2] = useState(30) // 모터 2 니들 돌출부분
  const [needleSpeed2, setNeedleSpeed2] = useState(1000) // 모터 2 니들 속도
  const [isDecelerationEnabled, setIsDecelerationEnabled] = useState(false) // 감속 활성화 여부
  const [decelerationPosition, setDecelerationPosition] = useState(5.0) // 감속 위치 (목표 위치에서 얼마나 떨어진 지점에서 감속할지, mm 단위)
  const [decelerationSpeed, setDecelerationSpeed] = useState(100) // 감속 스피드
  const [resistanceThreshold, setResistanceThreshold] = useState(100) // 저항 임계값 (정상값)
  const [isResistanceAbnormal, setIsResistanceAbnormal] = useState(false) // 저항 이상 여부
  const [motor2TargetPosition, setMotor2TargetPosition] = useState(0) // 모터2 목표 위치 (감속 로직용)
  const [hasDecelerated, setHasDecelerated] = useState(false) // 감속 실행 여부

  // 저항 측정 상태 (MTR 4.0에서만 사용)
  const [resistance1, setResistance1] = useState(NaN)
  const [resistance2, setResistance2] = useState(NaN)
  const [resistance1Status, setResistance1Status] = useState('N/A')
  const [resistance2Status, setResistance2Status] = useState('N/A')
  const [isResistanceMeasuring, setIsResistanceMeasuring] = useState(false)

  // 명령어 큐 상태 (디버깅용)
  const [commandQueueSize, setCommandQueueSize] = useState(0)

  // 니들팁 연결 상태에 따른 작업 상태 업데이트
  useEffect(() => {
    if (needleTipConnected) {
      // 니들팁 연결 시: '저장 완료' 상태가 아닌 경우에만 '작업 대기'로 업데이트
      setWorkStatus(prevStatus => {
        if (prevStatus !== 'write_success') {
          return 'waiting';
        }
        return prevStatus; // write_success 상태는 유지
      });
    } else {
      // 니들팁 분리 시: 항상 '니들팁 없음'으로 업데이트 (저장 완료 상태라도)
      setWorkStatus('disconnected');
    }
  }, [needleTipConnected]); // workStatus 의존성 제거
  
  // Camera 1 상태
  const [drawMode1, setDrawMode1] = useState(false)
  const [selectedIndex1, setSelectedIndex1] = useState(-1)
  const [lineInfo1, setLineInfo1] = useState('선 정보: 없음')
  const [calibrationValue1, setCalibrationValue1] = useState(19.8) // 실측 캘리브레이션 값 (99px = 5mm)
  const [selectedLineColor1, setSelectedLineColor1] = useState('red') // 선택된 선 색상 (red, cyan)
  const canvasRef1 = useRef(null)
  const videoContainerRef1 = useRef(null)
  const cameraViewRef1 = useRef(null) // CameraView ref 추가

  // DataSettingsPanel ref 추가 (GPIO 6번 START 버튼용)
  const dataSettingsPanelRef = useRef(null)
  
  // JudgePanel ref 추가 (GPIO 13번 PASS, 19번 NG 버튼용)
  const judgePanelRef = useRef(null)

  // Camera 2 상태
  const [drawMode2, setDrawMode2] = useState(false)
  const [selectedIndex2, setSelectedIndex2] = useState(-1)
  const [lineInfo2, setLineInfo2] = useState('선 정보: 없음')
  const [calibrationValue2, setCalibrationValue2] = useState(19.8) // 실측 캘리브레이션 값 (99px = 5mm)
  const [selectedLineColor2, setSelectedLineColor2] = useState('red') // 선택된 선 색상 (red, cyan)
  const canvasRef2 = useRef(null)
  const videoContainerRef2 = useRef(null)
  const cameraViewRef2 = useRef(null) // CameraView ref 추가

  // 공통 상태
  const [lines1, setLines1] = useState([])
  const [lines2, setLines2] = useState([])
  const [isDrawing1, setIsDrawing1] = useState(false)
  const [isDrawing2, setIsDrawing2] = useState(false)
  const [startPoint1, setStartPoint1] = useState(null)
  const [startPoint2, setStartPoint2] = useState(null)
  
  // 라벨 드래그 관련 상태
  const [isDraggingLabel1, setIsDraggingLabel1] = useState(false)
  const [isDraggingLabel2, setIsDraggingLabel2] = useState(false)
  const [draggingLabelIndex1, setDraggingLabelIndex1] = useState(-1)
  const [draggingLabelIndex2, setDraggingLabelIndex2] = useState(-1)
  const [labelDragOffset1, setLabelDragOffset1] = useState({ x: 0, y: 0 })
  const [labelDragOffset2, setLabelDragOffset2] = useState({ x: 0, y: 0 })

  // 두 카메라 이미지를 가로로 합쳐서 캡처하는 함수
  const captureMergedImage = async (judgeResult = null, eepromData = null) => {
    try {
      console.log('🔄 두 카메라 이미지 병합 캡처 시작...');
      
      // 니들 타입에 따른 저항 데이터 준비
      const isMultiNeedle = mtrVersion === '4.0' && selectedNeedleType && selectedNeedleType.startsWith('MULTI');
      const resistanceData = isMultiNeedle ? {
        resistance1: resistance1,
        resistance2: resistance2
      } : null; // 일반 니들은 저항 데이터 제외
      
      console.log(`🔍 니들 타입: ${selectedNeedleType}, MTR: ${mtrVersion}, 저항 데이터 포함: ${isMultiNeedle}`);
      
      // 두 카메라에서 개별 이미지 캡처
      const camera1Image = await cameraViewRef1.current?.captureImage(judgeResult, eepromData, resistanceData);
      const camera2Image = await cameraViewRef2.current?.captureImage(judgeResult, eepromData, resistanceData);
      
      if (!camera1Image || !camera2Image) {
        console.error('❌ 카메라 이미지 캡처 실패');
        return null;
      }
      
      // 이미지 로드를 위한 Promise 생성
      const loadImage = (dataURL) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = dataURL;
        });
      };
      
      // 두 이미지 로드
      const [img1, img2] = await Promise.all([
        loadImage(camera1Image),
        loadImage(camera2Image)
      ]);
      
      // 병합용 캔버스 생성 (가로로 이어붙이기)
      const mergedCanvas = document.createElement('canvas');
      const ctx = mergedCanvas.getContext('2d');
      
      // 캔버스 크기 설정 (두 이미지를 가로로 배치)
      mergedCanvas.width = img1.width + img2.width;
      mergedCanvas.height = Math.max(img1.height, img2.height);
      
      // 배경을 검은색으로 채우기
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);
      
      // 첫 번째 이미지 그리기 (왼쪽)
      ctx.drawImage(img1, 0, 0);
      
      // 두 번째 이미지 그리기 (오른쪽)
      ctx.drawImage(img2, img1.width, 0);
      
      // 구분선 그리기 (선택사항)
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(img1.width, 0);
      ctx.lineTo(img1.width, mergedCanvas.height);
      ctx.stroke();
      
      // 병합된 이미지 데이터 생성
      const mergedDataURL = mergedCanvas.toDataURL('image/png');
      
      console.log('✅ 두 카메라 이미지 병합 완료');
      return mergedDataURL;
      
    } catch (error) {
      console.error('❌ 이미지 병합 실패:', error);
      return null;
    }
  };

  // 병합된 이미지를 파일로 저장하는 함수
  const saveMergedImage = async (judgeResult = null, eepromData = null) => {
    try {
      const mergedImageData = await captureMergedImage(judgeResult, eepromData);
      
      if (!mergedImageData) {
        console.error('❌ 병합 이미지 생성 실패');
        return;
      }
      
      // 현재 시간을 파일명에 포함
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `merged_capture_${timestamp}.png`;
      
      // Electron API 사용 가능한지 확인
      if (window.electronAPI && window.electronAPI.saveImage) {
        // Electron 환경에서 저장
        const base64Data = mergedImageData.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        try {
          await window.electronAPI.saveImage(buffer, filename);
          console.log(`✅ 병합 이미지 저장 완료: ${filename}`);
        } catch (error) {
          console.error('❌ Electron API 저장 실패:', error);
          // fallback to browser download
          downloadMergedImage(mergedImageData, filename);
        }
      } else {
        // 브라우저 환경에서 다운로드
        downloadMergedImage(mergedImageData, filename);
      }
      
    } catch (error) {
      console.error('❌ 병합 이미지 저장 실패:', error);
    }
  };

  // 브라우저에서 이미지 다운로드
  const downloadMergedImage = (dataURL, filename) => {
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log(`✅ 병합 이미지 다운로드 완료: ${filename}`);
  };

  // 사용자 정보 기반 폴더 경로 생성 함수
  const generateUserBasedPath = async (judgeResult) => {
    const today = new Date();
    const workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; // YYYY-MM-DD (로컬 시간)

    let userFolder;
    // 사용자 정보 확인
    if (!user) {
      // 로그인하지 않은 경우 undefined 폴더에 저장
      userFolder = 'undefined';
      console.warn('⚠️ 사용자 정보가 없어 undefined 폴더에 저장합니다.');
    } else {
      // 로그인한 경우 사용자 정보 기반 폴더 사용 (CSV 기반)
      const workerCode = user.birthLast4 || '0000'; // birth 끝 4자리
      const workerName = user.id || 'unknown'; // CSV의 id 값
      userFolder = `${workerCode}-${workerName}`;
      console.log(`👤 사용자 정보 - 코드: ${workerCode}, 이름: ${workerName}`);
    }

    // 관리자 설정에서 이미지 저장 경로 로드
    let basePath = 'C:'; // 기본값
    try {
      const result = await window.electronAPI.getImageSavePath();
      if (result && result.success && result.data) {
        basePath = result.data;
        console.log(`📁 관리자 설정 이미지 저장 경로: ${basePath}`);
      }
    } catch (error) {
      console.warn('⚠️ 이미지 저장 경로 로드 실패, 기본값 사용:', error);
    }

    const finalPath = `${basePath}\\Inspect\\${userFolder}\\${workDate}\\${judgeResult}`;
    console.log(`📁 생성된 폴더 경로: ${finalPath}`);
    return finalPath;
  };

  // 마우스 위치 계산 함수
  const getMousePos = (canvas, e) => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  // H 형태 선 그리기 및 정보 표시 함수 (캘리브레이션 값 적용)
  const drawLineWithInfo = (ctx, line, color, showText, calibrationValue = 19.8, isSelected = false) => {
    const { x1, y1, x2, y2, labelX, labelY } = line
    
    // ctx가 null이 아닐 때만 그리기 실행
    if (ctx) {
      // 선택된 선은 노란색으로 표시
      const lineColor = isSelected ? '#ffff00' : color
      ctx.strokeStyle = lineColor
      // lineWidth는 호출하는 쪽에서 설정하므로 여기서는 설정하지 않음
      
      // 메인 선 그리기
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
      
      // H 형태를 위한 수직선 길이 (8px 고정)
      const dx = x2 - x1
      const dy = y2 - y1
      const length = Math.sqrt(dx * dx + dy * dy)
      const perpLength = 14 // 8px 고정
      
      // 수직 방향 벡터 계산 (메인 선에 수직)
      const perpX = -dy / length * perpLength
      const perpY = dx / length * perpLength
      
      // 시작점 수직선
      ctx.beginPath()
      ctx.moveTo(x1 - perpX / 2, y1 - perpY / 2)
      ctx.lineTo(x1 + perpX / 2, y1 + perpY / 2)
      ctx.stroke()
      
      // 끝점 수직선
      ctx.beginPath()
      ctx.moveTo(x2 - perpX / 2, y2 - perpY / 2)
      ctx.lineTo(x2 + perpX / 2, y2 + perpY / 2)
      ctx.stroke()

      if (showText) {
        const mm = length / calibrationValue // 올바른 공식: 픽셀거리 / (px/mm) = mm
        let angle = Math.atan2(dy, dx) * 180 / Math.PI
        const text = `${length.toFixed(1)}px / ${mm.toFixed(2)}mm (${angle.toFixed(1)}°)`
        
        // 라벨 위치 계산 (저장된 위치가 있으면 사용, 없으면 기본 위치)
        const textX = labelX !== undefined ? labelX : (x1 + x2) / 2 + 5
        const textY = labelY !== undefined ? labelY : (y1 + y2) / 2 - 5
        
        // 라벨 배경 그리기 (선택된 경우 테두리 추가)
        ctx.font = '14px Arial'
        const textMetrics = ctx.measureText(text)
        const textWidth = textMetrics.width
        const textHeight = 16 // 대략적인 텍스트 높이
        
        // 배경 박스
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        ctx.fillRect(textX - 2, textY - textHeight + 2, textWidth + 4, textHeight + 2)
        
        // 선택된 라벨은 테두리 추가
        if (isSelected) {
          ctx.strokeStyle = '#ffff00' // 노란색 테두리
          ctx.lineWidth = 2
          ctx.strokeRect(textX - 2, textY - textHeight + 2, textWidth + 4, textHeight + 2)
        }
        
        // 텍스트 그리기
        ctx.fillStyle = lineColor
        ctx.fillText(text, textX, textY)
      }
    }

    // 계산은 항상 수행 (ctx가 null이어도)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const mm = length / calibrationValue // 올바른 공식: 픽셀거리 / (px/mm) = mm
    let angle = Math.atan2(dy, dx) * 180 / Math.PI

    return { length: length.toFixed(1), mm: mm.toFixed(2), angle: angle.toFixed(2) }
  }

  // 기존 선의 모든 점에 스냅하는 함수
  const snapToExistingLines = (pos, lines, snapDistance = 15) => {
    let snappedPos = { ...pos }
    let minDistance = snapDistance
    
    lines.forEach(line => {
      // 선의 시작점과 끝점
      const dx = line.x2 - line.x1
      const dy = line.y2 - line.y1
      const lineLength = Math.sqrt(dx * dx + dy * dy)
      
      if (lineLength === 0) return // 길이가 0인 선은 무시
      
      // 마우스 위치에서 선까지의 가장 가까운 점 계산
      const t = Math.max(0, Math.min(1, ((pos.x - line.x1) * dx + (pos.y - line.y1) * dy) / (lineLength * lineLength)))
      const closestX = line.x1 + t * dx
      const closestY = line.y1 + t * dy
      
      // 가장 가까운 점까지의 거리 계산
      const distance = Math.sqrt(Math.pow(pos.x - closestX, 2) + Math.pow(pos.y - closestY, 2))
      
      // 스냅 거리 내에 있으면 스냅
      if (distance < minDistance) {
        snappedPos = { x: closestX, y: closestY }
        minDistance = distance
      }
    })
    
    return snappedPos
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

  // 선 클릭 감지 함수 (클릭 범위 확대)
  const isPointOnLine = (point, line, tolerance = 20) => {
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

  // 라벨 클릭 감지 함수
  const isPointOnLabel = (point, line, calibrationValue = 19.8) => {
    const { x1, y1, x2, y2, labelX, labelY } = line
    const { x, y } = point

    // 라벨 위치 계산
    const textX = labelX !== undefined ? labelX : (x1 + x2) / 2 + 5
    const textY = labelY !== undefined ? labelY : (y1 + y2) / 2 - 5

    // 라벨 텍스트 크기 계산 (대략적)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const mm = length / calibrationValue
    let angle = Math.atan2(dy, dx) * 180 / Math.PI
    const text = `${length.toFixed(1)}px / ${mm.toFixed(2)}mm (${angle.toFixed(1)}°)`
    
    // 대략적인 텍스트 크기 (14px Arial 기준)
    const textWidth = text.length * 8 // 대략적인 계산
    const textHeight = 16

    // 라벨 영역 내에 있는지 확인
    return (
      x >= textX - 2 &&
      x <= textX + textWidth + 2 &&
      y >= textY - textHeight + 2 &&
      y <= textY + 4
    )
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

      // 라벨 클릭 감지 (우선순위: 라벨 > 선)
      for (let i = lines1.length - 1; i >= 0; i--) {
        if (isPointOnLabel(pos, lines1[i], calibrationValue1)) {
          setSelectedIndex1(i)
          setIsDraggingLabel1(true)
          setDraggingLabelIndex1(i)
          
          // 라벨 드래그 오프셋 계산
          const line = lines1[i]
          const textX = line.labelX !== undefined ? line.labelX : (line.x1 + line.x2) / 2 + 5
          const textY = line.labelY !== undefined ? line.labelY : (line.y1 + line.y2) / 2 - 5
          setLabelDragOffset1({ x: pos.x - textX, y: pos.y - textY })
          
          const lineData = drawLineWithInfo(null, lines1[i], lines1[i].color || 'red', false, calibrationValue1)
          setLineInfo1(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas1()
          return
        }
      }

      // 선 클릭 감지
      for (let i = lines1.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines1[i])) {
          setSelectedIndex1(i)
          const lineData = drawLineWithInfo(null, lines1[i], lines1[i].color || 'red', false, calibrationValue1)
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
      const currentPos = getMousePos(canvasRef1.current, e)
      
      // 라벨 드래그 중인 경우
      if (isDraggingLabel1 && draggingLabelIndex1 >= 0) {
        const newLines = [...lines1]
        const newLabelX = currentPos.x - labelDragOffset1.x
        const newLabelY = currentPos.y - labelDragOffset1.y
        
        newLines[draggingLabelIndex1] = {
          ...newLines[draggingLabelIndex1],
          labelX: newLabelX,
          labelY: newLabelY
        }
        
        setLines1(newLines)
        redrawCanvas1()
        return
      }
      
      // 선 그리기 모드
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines1)
      const snappedPos = snapAngle(startPoint1, lineSnappedPos)
      
      const canvas = canvasRef1.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines1, selectedIndex1, calibrationValue1)
      
      // 임시 선 그리기 (H 형태)
      const tempLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y }
      ctx.lineWidth = 2
      drawLineWithInfo(ctx, tempLine, selectedLineColor1, true, calibrationValue1)
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath()
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'yellow'
        ctx.fill()
        ctx.strokeStyle = 'orange'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    },
    handleMouseUp: (e) => {
      // 라벨 드래그 종료
      if (isDraggingLabel1) {
        setIsDraggingLabel1(false)
        setDraggingLabelIndex1(-1)
        
        // 라벨 위치 변경 후 자동 저장
        setTimeout(() => {
          saveCameraLinesData(1, lines1, calibrationValue1, selectedLineColor1);
        }, 100);
        return
      }
      
      if (!drawMode1 || !isDrawing1 || !startPoint1) return
      
      const currentPos = getMousePos(canvasRef1.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines1)
      const snappedPos = snapAngle(startPoint1, lineSnappedPos)
      
      // 선의 길이 계산 (최소 길이 체크)
      const lineLength = Math.sqrt(
        Math.pow(snappedPos.x - startPoint1.x, 2) + 
        Math.pow(snappedPos.y - startPoint1.y, 2)
      )
      
      // 최소 길이 5픽셀 미만이면 선 생성하지 않음
      if (lineLength < 1) {
        console.log(`⚠️ 선이 너무 짧습니다 (${lineLength.toFixed(1)}px). 최소 1px 이상이어야 합니다.`)
        setIsDrawing1(false)
        setStartPoint1(null)
        setDrawMode1(false)
        return
      }
      
      const newLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y, color: selectedLineColor1 }
      const newLines = [...lines1, newLine]
      setLines1(newLines)
      
      // 선 추가 후 자동 저장
      setTimeout(() => {
        saveCameraLinesData(1, newLines, calibrationValue1, selectedLineColor1);
      }, 100);
      
      setIsDrawing1(false)
      setStartPoint1(null)
      setDrawMode1(false)
      setSelectedIndex1(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, selectedLineColor1, false, calibrationValue1)
      setLineInfo1(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex1 >= 0 && selectedIndex1 < lines1.length) {
        const newLines = lines1.filter((_, index) => index !== selectedIndex1)
        setLines1(newLines)
        setSelectedIndex1(-1)
        setLineInfo1('선 정보: 없음')
        redrawCanvas1()
        
        // 선 삭제 후 자동 저장
        setTimeout(() => {
          saveCameraLinesData(1, newLines, calibrationValue1, selectedLineColor1);
        }, 100);
      }
    },
    handleDeleteAllLines: () => {
      setLines1([])
      setSelectedIndex1(-1)
      setLineInfo1('선 정보: 없음')
      
      // 캔버스 클리어
      const canvas = canvasRef1.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      
      // 전체 삭제 후 자동 저장
      setTimeout(() => {
        saveCameraLinesData(1, [], calibrationValue1, selectedLineColor1);
      }, 100);
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

      // 라벨 클릭 감지 (우선순위: 라벨 > 선)
      for (let i = lines2.length - 1; i >= 0; i--) {
        if (isPointOnLabel(pos, lines2[i], calibrationValue2)) {
          setSelectedIndex2(i)
          setIsDraggingLabel2(true)
          setDraggingLabelIndex2(i)
          
          // 라벨 드래그 오프셋 계산
          const line = lines2[i]
          const textX = line.labelX !== undefined ? line.labelX : (line.x1 + line.x2) / 2 + 5
          const textY = line.labelY !== undefined ? line.labelY : (line.y1 + line.y2) / 2 - 5
          setLabelDragOffset2({ x: pos.x - textX, y: pos.y - textY })
          
          const lineData = drawLineWithInfo(null, lines2[i], lines2[i].color || 'red', false, calibrationValue2)
          setLineInfo2(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`)
          redrawCanvas2()
          return
        }
      }

      // 선 클릭 감지
      for (let i = lines2.length - 1; i >= 0; i--) {
        if (isPointOnLine(pos, lines2[i])) {
          setSelectedIndex2(i)
          const lineData = drawLineWithInfo(null, lines2[i], lines2[i].color || 'red', false, calibrationValue2)
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
      const currentPos = getMousePos(canvasRef2.current, e)
      
      // 라벨 드래그 중인 경우
      if (isDraggingLabel2 && draggingLabelIndex2 >= 0) {
        const newLines = [...lines2]
        const newLabelX = currentPos.x - labelDragOffset2.x
        const newLabelY = currentPos.y - labelDragOffset2.y
        
        newLines[draggingLabelIndex2] = {
          ...newLines[draggingLabelIndex2],
          labelX: newLabelX,
          labelY: newLabelY
        }
        
        setLines2(newLines)
        redrawCanvas2()
        return
      }
      
      // 선 그리기 모드
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines2)
      const snappedPos = snapAngle(startPoint2, lineSnappedPos)
      
      const canvas = canvasRef2.current
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // 기존 선들 그리기
      drawLines(ctx, lines2, selectedIndex2, calibrationValue2)
      
      // 임시 선 그리기 (H 형태)
      const tempLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y }
      ctx.lineWidth = 2
      drawLineWithInfo(ctx, tempLine, selectedLineColor2, true, calibrationValue2)
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath()
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI)
        ctx.fillStyle = 'yellow'
        ctx.fill()
        ctx.strokeStyle = 'orange'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    },
    handleMouseUp: (e) => {
      // 라벨 드래그 종료
      if (isDraggingLabel2) {
        setIsDraggingLabel2(false)
        setDraggingLabelIndex2(-1)
        
        // 라벨 위치 변경 후 자동 저장
        setTimeout(() => {
          saveCameraLinesData(2, lines2, calibrationValue2, selectedLineColor2);
        }, 100);
        return
      }
      
      if (!drawMode2 || !isDrawing2 || !startPoint2) return
      
      const currentPos = getMousePos(canvasRef2.current, e)
      // 먼저 기존 선에 스냅, 그 다음 각도 스냅 적용
      const lineSnappedPos = snapToExistingLines(currentPos, lines2)
      const snappedPos = snapAngle(startPoint2, lineSnappedPos)
      
      // 선의 길이 계산 (최소 길이 체크)
      const lineLength = Math.sqrt(
        Math.pow(snappedPos.x - startPoint2.x, 2) + 
        Math.pow(snappedPos.y - startPoint2.y, 2)
      )
      
      // 최소 길이 5픽셀 미만이면 선 생성하지 않음
      if (lineLength < 1) {
        console.log(`⚠️ 선이 너무 짧습니다 (${lineLength.toFixed(1)}px). 최소 1px 이상이어야 합니다.`)
        setIsDrawing2(false)
        setStartPoint2(null)
        setDrawMode2(false)
        return
      }
      
      const newLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y, color: selectedLineColor2 }
      const newLines = [...lines2, newLine]
      setLines2(newLines)
      
      // 선 추가 후 자동 저장
      setTimeout(() => {
        saveCameraLinesData(2, newLines, calibrationValue2, selectedLineColor2);
      }, 100);
      
      setIsDrawing2(false)
      setStartPoint2(null)
      setDrawMode2(false)
      setSelectedIndex2(newLines.length - 1)
      
      const lineData = drawLineWithInfo(null, newLine, selectedLineColor2, false, calibrationValue2)
      setLineInfo2(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`)
    },
    handleDeleteLine: () => {
      if (selectedIndex2 >= 0 && selectedIndex2 < lines2.length) {
        const newLines = lines2.filter((_, index) => index !== selectedIndex2)
        setLines2(newLines)
        setSelectedIndex2(-1)
        setLineInfo2('선 정보: 없음')
        redrawCanvas2()
        
        // 선 삭제 후 자동 저장
        setTimeout(() => {
          saveCameraLinesData(2, newLines, calibrationValue2, selectedLineColor2);
        }, 100);
      }
    },
    handleDeleteAllLines: () => {
      setLines2([])
      setSelectedIndex2(-1)
      setLineInfo2('선 정보: 없음')
      
      // 캔버스 클리어
      const canvas = canvasRef2.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      
      // 전체 삭제 후 자동 저장
      setTimeout(() => {
        saveCameraLinesData(2, [], calibrationValue2, selectedLineColor2);
      }, 100);
    }
  }

  // 선 그리기 헬퍼 함수 (캘리브레이션 값 적용)
  const drawLines = (ctx, lines, selectedIndex, calibrationValue) => {
    lines.forEach((line, index) => {
      const isSelected = index === selectedIndex
      const lineColor = line.color || 'red' // 저장된 색상 사용, 기본값은 빨간색
      // 선택된 선은 약간 더 굵게 표시
      ctx.lineWidth = isSelected ? 3 : 2
      drawLineWithInfo(ctx, line, lineColor, true, calibrationValue, isSelected)
    })
  }

  // 캔버스 다시 그리기 함수들
  const redrawCanvas1 = () => {
    const canvas = canvasRef1.current
    if (!canvas || canvas.width === 0 || canvas.height === 0) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines1, selectedIndex1, calibrationValue1)
  }

  const redrawCanvas2 = () => {
    const canvas = canvasRef2.current
    if (!canvas || canvas.width === 0 || canvas.height === 0) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawLines(ctx, lines2, selectedIndex2, calibrationValue2)
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
    
    // 캔버스 크기 조정 후 약간의 지연을 두고 다시 그리기
    setTimeout(() => {
      redrawCanvas1()
      redrawCanvas2()
    }, 100);
  }

  // START/STOP 버튼 클릭 핸들러 - DataSettingsPanel에서 EEPROM 로직 처리
  const handleStartStopClick = () => {
    const nextStartedState = !isStarted;
    setIsStarted(nextStartedState);

    if (nextStartedState) {
      // START 버튼 클릭 시: DataSettingsPanel에서 MTR 버전/국가 정보와 함께 EEPROM 읽기 처리
      console.log("🚀 START 버튼 클릭 - DataSettingsPanel에서 EEPROM 처리");
      
      // 감속 관련 상태 초기화
      if (isDecelerationEnabled && selectedNeedleType && selectedNeedleType.startsWith('MULTI')) {
        const targetPosition = Math.round((needleOffset2 - needleProtrusion2) * 40);
        setMotor2TargetPosition(targetPosition);
        setHasDecelerated(false);
        console.log('🐌 감속 모니터링 시작 - 목표 위치:', targetPosition);
      }
      
      // START 시 상태 변경 제거 - EEPROM 쓰기 완료 시에만 상태 변경
    } else {
      // STOP 버튼 클릭 시: 데이터 초기화
      console.log("🛑 STOP 버튼 클릭 - EEPROM 데이터 초기화");
      setReadEepromData(null);
      setWorkStatus('waiting');
      
      // 감속 관련 상태 초기화
      setMotor2TargetPosition(0);
      setHasDecelerated(false);
    }
  };

  // 디버깅 패널 드래그 핸들러들
  const handleMouseDown = (e) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    setDebugPanelPosition({
      x: e.clientX - dragOffset.x,
      y: e.clientY - dragOffset.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 전역 마우스 이벤트 리스너 추가
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 초기 위치를 화면 우측으로 설정
  useEffect(() => {
    const updateInitialPosition = () => {
      setDebugPanelPosition({ 
        x: window.innerWidth - 320, // 패널 너비(280px) + 여백(40px)
        y: 520 
      });
    };

    updateInitialPosition();
    window.addEventListener('resize', updateInitialPosition);

    return () => {
      window.removeEventListener('resize', updateInitialPosition);
    };
  }, []);

  // 카메라 선 정보 저장 함수
  const saveCameraLinesData = async (cameraId, lines, calibrationValue, selectedLineColor) => {
    try {
      if (window.electronAPI && window.electronAPI.saveCameraLines) {
        const linesData = {
          lines: lines,
          calibrationValue: calibrationValue,
          selectedLineColor: selectedLineColor
        };
        
        const result = await window.electronAPI.saveCameraLines(cameraId, linesData);
        if (!result.success) {
          console.error(`❌ 카메라 ${cameraId} 선 정보 저장 실패:`, result.error);
        }
        return result;
      }
    } catch (error) {
      console.error(`❌ 카메라 ${cameraId} 선 정보 저장 중 오류:`, error);
      return { success: false, error: error.message };
    }
  };

  // 카메라 선 정보 로드 함수
  const loadCameraLinesData = async (cameraId) => {
    try {
      if (window.electronAPI && window.electronAPI.loadCameraLines) {
        const result = await window.electronAPI.loadCameraLines(cameraId);
        if (result.success) {
          console.log(`✅ 카메라 ${cameraId} 선 정보 로드 완료:`, result.data);
          return result.data;
        } else {
          console.error(`❌ 카메라 ${cameraId} 선 정보 로드 실패:`, result.error);
        }
      }
    } catch (error) {
      console.error(`❌ 카메라 ${cameraId} 선 정보 로드 중 오류:`, error);
    }
    
    // 기본값 반환
    return {
      lines: [],
      calibrationValue: 19.8,
      selectedLineColor: 'red'
    };
  };

  // 모든 카메라 선 정보 저장 함수
  const saveAllCameraLines = async () => {
    try {
      await Promise.all([
        saveCameraLinesData(1, lines1, calibrationValue1, selectedLineColor1),
        saveCameraLinesData(2, lines2, calibrationValue2, selectedLineColor2)
      ]);
    } catch (error) {
      console.error('❌ 카메라 선 정보 저장 중 오류:', error);
    }
  };

  // 캘리브레이션 값 변경 및 저장 함수들
  const handleCalibrationChange1 = (newValue) => {
    setCalibrationValue1(newValue);
    setTimeout(() => {
      saveCameraLinesData(1, lines1, newValue, selectedLineColor1);
    }, 500); // 입력이 완료된 후 저장
  };

  const handleCalibrationChange2 = (newValue) => {
    setCalibrationValue2(newValue);
    setTimeout(() => {
      saveCameraLinesData(2, lines2, newValue, selectedLineColor2);
    }, 500); // 입력이 완료된 후 저장
  };

  // 선 색상 변경 및 저장 함수들
  const handleLineColorChange1 = (newColor) => {
    setSelectedLineColor1(newColor);
    setTimeout(() => {
      saveCameraLinesData(1, lines1, calibrationValue1, newColor);
    }, 100);
  };

  const handleLineColorChange2 = (newColor) => {
    setSelectedLineColor2(newColor);
    setTimeout(() => {
      saveCameraLinesData(2, lines2, calibrationValue2, newColor);
    }, 100);
  };

  // 프로그램 시작시 저장된 선 정보 로드
  useEffect(() => {
    const loadAllSavedLines = async () => {
      try {
        
        // 카메라 1 선 정보 로드
        const camera1Data = await loadCameraLinesData(1);
        if (camera1Data.lines && camera1Data.lines.length > 0) {
          setLines1([...camera1Data.lines]); // 새 배열로 복사하여 상태 업데이트 강제
        }
        if (camera1Data.calibrationValue) {
          setCalibrationValue1(camera1Data.calibrationValue);
        }
        if (camera1Data.selectedLineColor) {
          setSelectedLineColor1(camera1Data.selectedLineColor);
        }

        // 카메라 2 선 정보 로드
        const camera2Data = await loadCameraLinesData(2);
        if (camera2Data.lines && camera2Data.lines.length > 0) {
          setLines2([...camera2Data.lines]); // 새 배열로 복사하여 상태 업데이트 강제
        }
        if (camera2Data.calibrationValue) {
          setCalibrationValue2(camera2Data.calibrationValue);
        }
        if (camera2Data.selectedLineColor) {
          setSelectedLineColor2(camera2Data.selectedLineColor);
        }


        // 상태 업데이트 완료 후 한 번만 그리기 (중복 방지)
        
        // 강력한 디버깅과 함께 캔버스 그리기
        const forceCanvasDraw = (attempt = 1) => {
          const canvas1 = canvasRef1.current;
          const canvas2 = canvasRef2.current;
          const container1 = videoContainerRef1.current;
          const container2 = videoContainerRef2.current;
          
          if (canvas1 && canvas2 && container1 && container2) {
            // 캔버스 크기 강제 설정
            const rect1 = container1.getBoundingClientRect();
            const rect2 = container2.getBoundingClientRect();
            
            canvas1.width = rect1.width || 400;
            canvas1.height = rect1.height || 300;
            canvas2.width = rect2.width || 400;
            canvas2.height = rect2.height || 300;
            
            // 이전 방식으로 직접 선 그리기 (테스트 사각형만 제거)
            if (camera1Data.lines && camera1Data.lines.length > 0) {
              const ctx1 = canvas1.getContext('2d');
              if (ctx1) {
                ctx1.clearRect(0, 0, canvas1.width, canvas1.height);
                
                // 선과 선 정보를 함께 그리기 (drawLineWithInfo 사용)
                camera1Data.lines.forEach((line, index) => {
                  const lineColor = line.color || 'red';
                  ctx1.lineWidth = 2;
                  drawLineWithInfo(ctx1, line, lineColor, true, camera1Data.calibrationValue || 19.8, false);
                });
                
                // 외부 선 정보도 업데이트
                const firstLine = camera1Data.lines[0];
                const lineData = drawLineWithInfo(null, firstLine, firstLine.color || 'red', false, camera1Data.calibrationValue || 19.8);
                setLineInfo1(`선 1: ${lineData.mm}mm (${lineData.angle}°)`);
              }
            }
            
            if (camera2Data.lines && camera2Data.lines.length > 0) {
              const ctx2 = canvas2.getContext('2d');
              if (ctx2) {
                ctx2.clearRect(0, 0, canvas2.width, canvas2.height);
                
                // 선과 선 정보를 함께 그리기 (drawLineWithInfo 사용)
                camera2Data.lines.forEach((line, index) => {
                  const lineColor = line.color || 'cyan';
                  ctx2.lineWidth = 2;
                  drawLineWithInfo(ctx2, line, lineColor, true, camera2Data.calibrationValue || 19.8, false);
                });
                
                // 외부 선 정보도 업데이트
                const firstLine = camera2Data.lines[0];
                const lineData = drawLineWithInfo(null, firstLine, firstLine.color || 'cyan', false, camera2Data.calibrationValue || 19.8);
                setLineInfo2(`선 1: ${lineData.mm}mm (${lineData.angle}°)`);
              }
            }
            
          } else {
            if (attempt < 10) {
              setTimeout(() => forceCanvasDraw(attempt + 1), 500);
            }
          }
        };
        
        // 상태 업데이트를 기다린 후 그리기
        setTimeout(() => {
          forceCanvasDraw();
        }, 2000);
      } catch (error) {
        console.error('❌ 저장된 카메라 선 정보 로드 실패:', error);
      }
    };

    loadAllSavedLines();
  }, []); // 컴포넌트 마운트시 한 번만 실행

  // WebSocket 자동 연결 (컴포넌트 마운트 시)
  useEffect(() => {
    console.log("🚀 컴포넌트 마운트 - WebSocket 자동 연결 시작")
    connectWebSocket()
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      console.log("🔧 컴포넌트 언마운트 - WebSocket 연결 정리")
      
      // 재연결 타이머 정리
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // WebSocket 연결 정리
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ cmd: "disconnect" }))
        setTimeout(() => {
          ws.close()
        }, 500)
      }
    }
  }, []) // 컴포넌트 마운트시 한 번만 실행

  // DOM 렌더링 완료 후 캔버스 초기화 (중복 실행 방지)
  useLayoutEffect(() => {
    // 로드 중이면 실행하지 않음 (중복 방지)
    if (lines1.length === 0 && lines2.length === 0) {
      return;
    }

    const initializeCanvas = () => {
      const canvas1 = canvasRef1.current;
      const canvas2 = canvasRef2.current;
      const container1 = videoContainerRef1.current;
      const container2 = videoContainerRef2.current;
      
      if (canvas1 && canvas2 && container1 && container2) {
        // 캔버스 크기 설정
        resizeCanvas(canvas1, container1);
        resizeCanvas(canvas2, container2);
        
        // 즉시 그리기 시도
        redrawCanvas1();
        redrawCanvas2();
      }
    };

    // DOM이 완전히 렌더링된 후 실행
    initializeCanvas();
  }, [lines1.length, lines2.length]); // 선 개수가 변경될 때만 실행

  // 프로그램 종료시 선 정보 자동 저장을 위한 beforeunload 이벤트
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 동기적으로 저장 (비동기는 브라우저가 차단할 수 있음)
      if (lines1.length > 0 || lines2.length > 0) {
        saveAllCameraLines();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 컴포넌트 언마운트시에도 저장
      if (lines1.length > 0 || lines2.length > 0) {
        saveAllCameraLines();
      }
    };
  }, [lines1, lines2, calibrationValue1, calibrationValue2, selectedLineColor1, selectedLineColor2]);

  useEffect(() => {
    redrawCanvas1()
  }, [lines1, selectedIndex1, calibrationValue1])

  useEffect(() => {
    redrawCanvas2()
  }, [lines2, selectedIndex2, calibrationValue2])

  // WebSocket 자동 재연결 로직
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const reconnectTimeoutRef = useRef(null)
  const maxReconnectAttempts = 10
  const reconnectDelay = 3000 // 3초

  // WebSocket 연결 함수
  const connectWebSocket = useCallback(() => {
    if (isReconnecting) {
      console.log("🔄 이미 재연결 시도 중...")
      return
    }

    console.log(`🔗 WebSocket 연결 시도... (시도 횟수: ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
    setIsReconnecting(true)
    
    const socket = new WebSocket("ws://192.168.5.11:8765")

    socket.onopen = () => {
      console.log("✅ WebSocket 연결 성공!")
      setIsWsConnected(true)
      setMotorError(null)
      setReconnectAttempts(0) // 성공 시 재연결 횟수 초기화
      setIsReconnecting(false)
      
      // WebSocket 연결 후 자동으로 모터 연결 시도
      setTimeout(() => {
        connectMotor(socket)
      }, 1000)
    }

    socket.onclose = (event) => {
      console.log(`❌ WebSocket 연결 끊김 (코드: ${event.code}, 이유: ${event.reason})`);
      setIsWsConnected(false)
      setIsMotorConnected(false)
      setIsMotor2Connected(false)
      setIsReconnecting(false)
      
      // 정상 종료가 아닌 경우에만 재연결 시도
      if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
        const nextAttempt = reconnectAttempts + 1
        setReconnectAttempts(nextAttempt)
        setMotorError(`연결 끊김 - ${reconnectDelay/1000}초 후 재연결 시도 (${nextAttempt}/${maxReconnectAttempts})`)
        
        console.log(`🔄 ${reconnectDelay/1000}초 후 재연결 시도 (${nextAttempt}/${maxReconnectAttempts})`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, reconnectDelay)
      } else if (reconnectAttempts >= maxReconnectAttempts) {
        console.error("❌ 최대 재연결 시도 횟수 초과 - 수동 새로고침 필요")
        setMotorError(`연결 실패 - 최대 재연결 시도 초과 (${maxReconnectAttempts}회). 페이지를 새로고침하거나 서버 상태를 확인하세요.`)
      } else {
        setMotorError("WebSocket 연결이 정상 종료되었습니다.")
      }
    }

    socket.onerror = (err) => {
      console.error("❌ WebSocket 연결 오류:", err)
      setIsReconnecting(false)
      
      if (reconnectAttempts < maxReconnectAttempts) {
        setMotorError(`연결 오류 - ${reconnectDelay/1000}초 후 재연결 시도`)
      } else {
        setMotorError("WebSocket 연결 오류 - 최대 재연결 시도 초과")
      }
    }

    socket.onmessage = (e) => {
      try {
        // 빈 메시지나 잘못된 형식 체크
        if (!e.data || typeof e.data !== 'string' || e.data.trim() === '') {
          return;
        }
        
        const res = JSON.parse(e.data)

        if (res.type === "serial") {
          // 모터 ID 구분 (응답에 motor_id가 포함되어 있는지 확인)
          const motorId = res.motor_id || 1; // 기본값은 모터 1
          
          if (res.result.includes("성공") || 
              res.result.includes("완료") || 
              res.result.includes("전송 완료")) {
            if (motorId === 1) {
              setIsMotorConnected(true)
              setMotorError(null)
            } else if (motorId === 2) {
              setIsMotor2Connected(true)
              setMotor2Error(null)
            }
          } else if (res.result.includes("실패") || 
                     res.result.includes("오류")) {
            console.error(`❌ 모터 ${motorId} 연결 실패:`, res.result)
            if (motorId === 1) {
              setIsMotorConnected(false)
              setMotorError(res.result)
            } else if (motorId === 2) {
              setIsMotor2Connected(false)
              setMotor2Error(res.result)
            }
          } else {
            // 만약 모터가 이미 연결되어 있고 명령이 정상 처리되면 연결 상태 유지
            if (motorId === 1 && isMotorConnected && res.result && !res.result.includes("실패") && !res.result.includes("오류")) {
              // 모터 1 연결 상태 유지
            } else if (motorId === 2 && isMotor2Connected && res.result && !res.result.includes("실패") && !res.result.includes("오류")) {
              // 모터 2 연결 상태 유지
            }
          }
        } else if (res.type === "status") {
          // 상태 업데이트 (모터 + GPIO + EEPROM)
          const { 
            position, 
            gpio5, 
            gpio6,
            gpio13,
            gpio19,
            gpio23, 
            needle_tip_connected, 
            eeprom,
            motor2_position,
            motor2_force,
            motor2_sensor,
            motor2_setPos,
            command_queue_size
          } = res.data
          
          // 모터 1 상태 업데이트
          setCurrentPosition(position)
          setNeedlePosition('UP') // 기본 'UP'으로 설정
          
          // 모터 2 상태 업데이트
          if (motor2_position !== undefined) {
            setCurrentPosition2(motor2_position)
            setMotor2Position(motor2_position) // 실시간 위치 업데이트
            setNeedlePosition2('UP') // 기본 'UP'으로 설정
            setIsMotor2Connected(true) // 모터 2 데이터가 있으면 연결된 것으로 간주
            
            // 실시간 감속 로직: 목표 위치에 가까워지면 감속 명령 전송
            if (isDecelerationEnabled && motor2TargetPosition > 0 && !hasDecelerated && isStarted && selectedNeedleType && selectedNeedleType.startsWith('MULTI')) {
              const currentPos = motor2_position;
              const targetPos = motor2TargetPosition;
              const threshold = Math.round(decelerationPosition * 40); // mm를 모터 단위로 변환
              const distance = Math.abs(targetPos - currentPos);
              
              // 목표 위치에 가까워지면 감속 (임계값 이내이고 아직 목표에 도달하지 않은 경우)
              if (distance <= threshold && distance > 0) {
                console.log('🐌 목표 위치 근접 감속 실행 - 현재:', currentPos, ', 목표:', targetPos, ', 거리:', distance, ', 임계값:', threshold);
                
                // 감속 명령 전송
                if (ws && isWsConnected) {
                  ws.send(JSON.stringify({ 
                    cmd: "move", 
                    position: targetPos, 
                    needle_speed: decelerationSpeed,
                    motor_id: 2
                  }));
                  setHasDecelerated(true); // 감속 실행 완료 표시
                  console.log('✅ 감속 명령 전송 완료 - 감속 스피드:', decelerationSpeed);
                }
              }
            }
          }
          
          // GPIO23 기반 니들팁 연결 상태 업데이트
          if (typeof needle_tip_connected === 'boolean') {
            setNeedleTipConnected(needle_tip_connected)
          }
          
          // 명령어 큐 크기 업데이트 (디버깅용)
          if (typeof command_queue_size === 'number') {
            setCommandQueueSize(command_queue_size)
          }
          
          // EEPROM 데이터 자동 처리 제거 - START/STOP 버튼으로만 제어
          // 기존 코드가 WebSocket 응답마다 EEPROM 데이터를 초기화하여 문제 발생
          if (eeprom && eeprom.success) {
            // EEPROM 데이터 수신 감지 (자동 처리 비활성화)
          }
          
          // GPIO 5번 상태 업데이트 (Short 체크용 - 상태 표시만)
          if (gpio5 && gpio5 !== "UNKNOWN") {
            // 상태 업데이트 (디버깅 패널 표시용)
            prevGpio5Ref.current = gpio5
            setGpio5State(gpio5)
          }
          
          // GPIO 6, 13, 19번 상태 업데이트 (디버깅 패널용)
          if (gpio6 && gpio6 !== "UNKNOWN") {
            setGpio6State(gpio6)
          }
          if (gpio13 && gpio13 !== "UNKNOWN") {
            setGpio13State(gpio13)
          }
          if (gpio19 && gpio19 !== "UNKNOWN") {
            setGpio19State(gpio19)
          }
        } else if (res.type === "resistance") {
          // 저항 측정 결과 처리
          console.log('📊 저항 측정 결과 수신:', res.data)
          
          if (res.data) {
            setResistance1(res.data.resistance1 || 'N/A')
            setResistance2(res.data.resistance2 || 'N/A')
            setResistance1Status(res.data.status1 || 'N/A')
            setResistance2Status(res.data.status2 || 'N/A')
          }
          
          // 측정 완료 상태로 변경
          setIsResistanceMeasuring(false)
        } else if (res.type === "gpio_start_button") {
          // GPIO 6번 START 버튼 스위치 신호 처리
          console.log('🔘 GPIO6 START 버튼 스위치 신호 수신:', res.data)
          
          if (res.data && res.data.triggered) {
            // DataSettingsPanel의 실제 START 버튼과 동일한 동작 수행
            console.log('🚀 GPIO6 START 버튼 스위치로 실제 START 워크플로우 실행')
            // DataSettingsPanel의 handleToggle 함수를 직접 호출하기 위해 ref를 통해 접근
            if (dataSettingsPanelRef.current && dataSettingsPanelRef.current.handleToggle) {
              dataSettingsPanelRef.current.handleToggle()
            } else {
              console.warn('DataSettingsPanel handleToggle 함수에 접근할 수 없음 - 기본 상태 변경만 실행')
              handleStartStopClick()
            }
          }
        } else if (res.type === "gpio_pass_button") {
          // GPIO 13번 PASS 버튼 스위치 신호 처리
          console.log('🔘 GPIO13 PASS 버튼 스위치 신호 수신:', res.data)
          
          if (res.data && res.data.triggered) {
            // JudgePanel의 실제 PASS 버튼과 동일한 동작 수행
            console.log('✅ GPIO13 PASS 버튼 스위치로 실제 PASS 워크플로우 실행')
            // JudgePanel의 handlePASSClick 함수를 직접 호출하기 위해 ref를 통해 접근
            if (judgePanelRef.current && judgePanelRef.current.handlePASSClick) {
              judgePanelRef.current.handlePASSClick()
            } else {
              console.warn('JudgePanel handlePASSClick 함수에 접근할 수 없음')
            }
          }
        } else if (res.type === "gpio_ng_button") {
          // GPIO 19번 NG 버튼 스위치 신호 처리
          console.log('🔘 GPIO19 NG 버튼 스위치 신호 수신:', res.data)
          
          if (res.data && res.data.triggered) {
            // JudgePanel의 실제 NG 버튼과 동일한 동작 수행
            console.log('❌ GPIO19 NG 버튼 스위치로 실제 NG 워크플로우 실행')
            // JudgePanel의 handleNGClick 함수를 직접 호출하기 위해 ref를 통해 접근
            if (judgePanelRef.current && judgePanelRef.current.handleNGClick) {
              judgePanelRef.current.handleNGClick()
            } else {
              console.warn('JudgePanel handleNGClick 함수에 접근할 수 없음')
            }
          }
        // EEPROM 관련 메시지는 DataSettingsPanel에서 Promise 기반으로 직접 처리
        // 중복 처리 방지를 위해 메인 UI에서는 제거
        } else if (res.type === "error") {
          console.error("❌ 모터 오류:", res.result)
          setMotorError(res.result)
        }
      } catch (err) {
        console.error("❌ 모터 메시지 파싱 오류:", err)
        console.error("❌ 문제가 된 원본 데이터:", e.data)
        console.error("❌ 데이터 타입:", typeof e.data)
        console.error("❌ 데이터 길이:", e.data?.length)
      }
    }

    setWs(socket)
  }, [reconnectAttempts, isReconnecting])

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

    socket.send(JSON.stringify(msg))
  }

  // 니들 위치 제어 함수
  const handleNeedlePosition = (targetPosition) => {
    console.log("🔍 handleNeedlePosition 호출 - 목표 위치:", targetPosition)
    console.log("🔍 연결 상태 - WebSocket:", ws?.readyState, "Motor:", isMotorConnected)
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error("❌ WebSocket이 연결되지 않았습니다.")
      setMotorError("WebSocket이 연결되지 않았습니다.")
      return
    }

    const msg = {
      cmd: "move",
      position: targetPosition,
      mode: "position",
    }

    console.log(`🎯 니들 ${targetPosition > 0 ? 'UP' : 'DOWN'} 명령 전송:`, msg)
    ws.send(JSON.stringify(msg))
    setMotorError(null)
  }

  // 니들 UP 함수
  const handleNeedleUp = () => {
    handleNeedlePosition(calculatedMotorPosition)
  }

  // 니들 DOWN 함수
  const handleNeedleDown = () => {
    handleNeedlePosition(0);
  }

  // 판정 후 상태 초기화 함수 (동기 로직으로 단순화)
  const handleJudgeReset = () => {
    console.log('🔄 판정 후 상태 초기화 시작');
    
    // 1. EEPROM UI 데이터 초기화
    setReadEepromData(null);
    console.log('✅ EEPROM UI 데이터 초기화 완료');
    
    // 2. EEPROM 읽기 대기 상태 초기화
    setIsWaitingEepromRead(false);
    console.log('✅ EEPROM 읽기 대기 상태 초기화 완료');
    
    // 3. START/STOP 상태 초기화 (STOP 상태로 변경)
    setIsStarted(false);
    console.log('✅ START/STOP 상태 초기화 완료');
    
    // 4. 작업 상태를 대기로 변경 (판정 후 정상 흐름)
    setWorkStatus('waiting');
    console.log('✅ 작업 상태 초기화 완료 (판정 후 대기 상태)');
    
    // 5. 저항 값 데이터 초기화
    setResistance1(NaN);
    setResistance2(NaN);
    setResistance1Status('IDLE');
    setResistance2Status('IDLE');
    console.log('✅ 저항 값 데이터 초기화 완료');
    
    console.log('🎉 판정 후 상태 초기화 완료 - 동기 로직으로 race condition 해결');
  };

  // 기존 handleStartStopClick 함수 제거 - 새로운 함수로 대체됨

  // GPIO 자동 토글 함수 (GPIO 6번 START 버튼 등에서 사용)
  const handleAutoToggle = () => {
    console.log("🔄 GPIO 토글 감지 - 모터 상태 기반 명령 전송!")
    console.log("🔍 디버그 정보 - currentPosition:", currentPosition, "needlePosition:", needlePosition)
    
    // MOVING 상태 확인
    if (needlePosition === 'MOVING') {
      console.log("⚠️ 니들이 이동 중 - 자동 명령 대기")
      return
    }

    // 현재 모터 상태에 따라 반대 명령 결정
    let targetPosition
    let commandDirection
    
    // 현재 위치 기반으로 반대 명령 결정 (하드코딩 제거)
    if (currentPosition <= 50) {
      // 현재 DOWN 위치 → UP 명령 (현재 위치 + 800)
      targetPosition = currentPosition + 800
      commandDirection = 'UP'
      console.log("✅ DOWN 위치 감지 - UP 명령 준비")
    } else {
      // 현재 UP 위치 → DOWN 명령 (0으로 이동)
      targetPosition = 0
      commandDirection = 'DOWN'
      console.log("✅ UP 위치 감지 - DOWN 명령 준비")
    }
    
    console.log(`🎯 모터 상태: ${needlePosition} (position: ${currentPosition}) → ${commandDirection} 명령 (위치: ${targetPosition})`)

    // 직접 모터 명령 WebSocket 생성
    console.log("🔗 모터 명령용 WebSocket 연결 생성...")
    const autoSocket = new WebSocket('ws://192.168.0.96:8765')
    
    autoSocket.onopen = () => {
      console.log("✅ 모터 명령용 WebSocket 연결 성공")
      
      // 백엔드 cmd: "move" 명령 사용
      const command = { 
        cmd: 'move',
        mode: 'servo',
        position: targetPosition
      }
      // 얌얌얌
      console.log(`📦 전송할 명령:`, JSON.stringify(command))
      autoSocket.send(JSON.stringify(command))
      
      console.log(`🚀 GPIO 자동 명령 전송 완료: ${commandDirection} (위치: ${targetPosition})`)
      
      // 명령 전송 후 연결 종료
      setTimeout(() => {
        autoSocket.close()
        console.log("🔗 모터 명령용 WebSocket 연결 종료")
      }, 1000)
    }
    
    autoSocket.onerror = (err) => {
      console.error("❌ 모터 명령용 WebSocket 연결 실패:", err)
    }
    
    autoSocket.onclose = () => {
      console.log("🔗 모터 명령용 WebSocket 연결 종료됨")
    }
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
    <div className="bg-[#000000] min-h-screen text-white font-sans p-4 flex flex-col gap-4">
      {/* 디버깅 패널 - 디버깅 모드가 ON일 때만 표시 */}
      {isDebugMode && (
        <div 
          style={{
            position: 'fixed',
            top: `${debugPanelPosition.y}px`,
            left: `${debugPanelPosition.x}px`,
            zIndex: 1000,
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          onMouseDown={handleMouseDown}
        >
        <div style={{
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: 'bold',
          backgroundColor: '#1F2937',
          color: '#F3F4F6',
          border: isDragging ? '2px solid #3B82F6' : '1px solid #374151',
          textAlign: 'left',
          minWidth: '280px',
          userSelect: 'none', // 드래그 중 텍스트 선택 방지
          boxShadow: isDragging ? '0 8px 25px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {/* 드래그 핸들 표시 */}
          <div style={{
            textAlign: 'center',
            fontSize: '10px',
            color: '#9CA3AF',
            marginBottom: '6px',
            borderBottom: '1px solid #374151',
            paddingBottom: '4px'
          }}>
            ⋮⋮⋮ 드래그하여 이동 ⋮⋮⋮
          </div>
          {/* 모터 1 섹션 */}
          <div style={{ 
            marginBottom: '8px',
            padding: '6px',
            borderRadius: '4px',
            backgroundColor: isMotorConnected ? '#065F46' : '#7F1D1D',
            border: `1px solid ${isMotorConnected ? '#10B981' : '#EF4444'}`
          }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              🔧 모터 1: {isMotorConnected ? '연결됨' : '연결 안됨'}
            </div>
            <div style={{ fontSize: '10px', marginBottom: '2px' }}>
              위치: {currentPosition} ({(currentPosition / 125).toFixed(2)}mm)
            </div>
            {motorError && (
              <div style={{ fontSize: '9px', color: '#FCA5A5', marginTop: '2px' }}>
                오류: {motorError}
              </div>
            )}
          </div>

          {/* 모터 2 섹션 */}
          <div style={{ 
            marginBottom: '8px',
            padding: '6px',
            borderRadius: '4px',
            backgroundColor: isMotor2Connected ? '#065F46' : '#7F1D1D',
            border: `1px solid ${isMotor2Connected ? '#10B981' : '#EF4444'}`
          }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              🔧 모터 2: {isMotor2Connected ? '연결됨' : '연결 안됨'}
            </div>
            <div style={{ fontSize: '10px', marginBottom: '2px' }}>
              위치: {currentPosition2} ({(currentPosition2 / 40).toFixed(2)}mm)
            </div>
            {motor2Error && (
              <div style={{ fontSize: '9px', color: '#FCA5A5', marginTop: '2px' }}>
                오류: {motor2Error}
              </div>
            )}
          </div>

          {/* GPIO 섹션 */}
          <div style={{ 
            marginBottom: '8px',
            padding: '6px',
            borderRadius: '4px',
            backgroundColor: '#374151',
            border: '1px solid #6B7280'
          }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              📡 GPIO 상태
            </div>
            <div style={{ 
              fontSize: '10px', 
              marginBottom: '2px',
              color: gpio5State === 'LOW' ? '#34D399' : '#F87171',
              fontWeight: 'bold'
            }}>
              {gpio5State === 'LOW' ? '✅ 쇼트 체크 (GPIO5 LOW)' : '🚫 쇼트 체크 (GPIO5 HIGH)'}
            </div>
            <div style={{ 
              fontSize: '10px', 
              color: needleTipConnected ? '#34D399' : '#F87171',
              fontWeight: 'bold'
            }}>
              {needleTipConnected ? '✅ 니들팁 연결됨 (GPIO23 LOW)' : '🚫 니들팁 없음 (GPIO23 HIGH)'}
            </div>
            <div style={{ 
              fontSize: '9px', 
              marginTop: '4px',
              color: '#9CA3AF',
              fontWeight: 'bold'
            }}>
              🔘 물리 버튼 상태:
            </div>
            <div style={{ 
              fontSize: '9px', 
              marginBottom: '1px',
              color: gpio6State === 'HIGH' ? '#F59E0B' : '#6B7280',
              fontWeight: 'bold'
            }}>
              START (GPIO6): {gpio6State === 'HIGH' ? '🟡 눌림' : '⚫ 안눌림'}
            </div>
            <div style={{ 
              fontSize: '9px', 
              marginBottom: '1px',
              color: gpio13State === 'HIGH' ? '#10B981' : '#6B7280',
              fontWeight: 'bold'
            }}>
              PASS (GPIO13): {gpio13State === 'HIGH' ? '🟢 눌림' : '⚫ 안눌림'}
            </div>
            <div style={{ 
              fontSize: '9px', 
              color: gpio19State === 'HIGH' ? '#EF4444' : '#6B7280',
              fontWeight: 'bold'
            }}>
              NG (GPIO19): {gpio19State === 'HIGH' ? '🔴 눌림' : '⚫ 안눌림'}
            </div>
          </div>

          {/* 명령어 큐 상태 섹션 */}
          <div style={{ 
            marginBottom: '8px',
            padding: '6px',
            borderRadius: '4px',
            backgroundColor: commandQueueSize > 0 ? '#7C2D12' : '#065F46',
            border: `1px solid ${commandQueueSize > 0 ? '#F97316' : '#10B981'}`
          }}>
            <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
              📋 명령어 큐 상태
            </div>
            <div style={{ 
              fontSize: '10px', 
              color: commandQueueSize > 0 ? '#FED7AA' : '#D1FAE5',
              fontWeight: 'bold'
            }}>
              {commandQueueSize > 0 ? `🟡 대기 중: ${commandQueueSize}개` : '🟢 비어있음 (0개)'}
            </div>
            <div style={{ fontSize: '9px', color: '#9CA3AF', marginTop: '2px' }}>
              {commandQueueSize > 0 ? '명령어가 순차 처리 중입니다' : '모든 명령어 처리 완료'}
            </div>
          </div>

          {/* EEPROM 데이터 섹션 */}
          {readEepromData && (
            <div style={{ 
              padding: '6px',
              borderRadius: '4px',
              backgroundColor: '#1E40AF',
              border: '1px solid #3B82F6'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px' }}>
                💾 EEPROM 데이터
              </div>
              <div style={{ fontSize: '9px', marginBottom: '1px' }}>
                TIP: {readEepromData.tipType} | SHOT: {readEepromData.shotCount}
              </div>
              <div style={{ fontSize: '9px', marginBottom: '1px' }}>
                DATE: {readEepromData.year}-{String(readEepromData.month).padStart(2, '0')}-{String(readEepromData.day).padStart(2, '0')}
              </div>
              <div style={{ fontSize: '9px' }}>
                MAKER: {readEepromData.makerCode}
              </div>
            </div>
          )}
        </div>
        </div>
      )}
      
      <main className="flex flex-col flex-1 gap-4 overflow-hidden">
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
            onDeleteAllLines={handlers1.handleDeleteAllLines}
            selectedIndex={selectedIndex1}
            lineInfo={lineInfo1}
            handlers={handlers1}
            canvasRef={canvasRef1}
            videoContainerRef={videoContainerRef1}
            calibrationValue={calibrationValue1}
            onCalibrationChange={handleCalibrationChange1}
            selectedLineColor={selectedLineColor1}
            onLineColorChange={handleLineColorChange1}
            workStatus={workStatus} // 작업 상태 전달
            ref={cameraViewRef1} // CameraView ref 추가
          />
          <CameraView 
            title="Camera 2" 
            cameraId={2}
            videoServerUrl={videoServerUrl}
            videoEndpoint="/video2"
            drawMode={drawMode2}
            onDrawModeToggle={() => setDrawMode2(!drawMode2)}
            onDeleteLine={handlers2.handleDeleteLine}
            onDeleteAllLines={handlers2.handleDeleteAllLines}
            selectedIndex={selectedIndex2}
            lineInfo={lineInfo2}
            handlers={handlers2}
            canvasRef={canvasRef2}
            videoContainerRef={videoContainerRef2}
            calibrationValue={calibrationValue2}
            onCalibrationChange={handleCalibrationChange2}
            selectedLineColor={selectedLineColor2}
            onLineColorChange={handleLineColorChange2}
            workStatus={workStatus} // 작업 상태 전달
            ref={cameraViewRef2} // CameraView ref 추가
          />
        </div>

        {/* Bottom Control Panels */}
        <div className="flex gap-4" style={{ height: '35dvh' }}>
          <div className="w-[20%]">
            <StatusPanel mode={mode} workStatus={workStatus} needleTipConnected={needleTipConnected} isWaitingEepromRead={isWaitingEepromRead} />
          </div>
          <div className="w-[31%]">
            <DataSettingsPanel 
            ref={dataSettingsPanelRef} // GPIO 6번 START 버튼용 ref 추가
            makerCode={makerCode} 
            onWorkStatusChange={setWorkStatus}
            isStarted={isStarted}
            onStartedChange={handleStartStopClick} // START/STOP 상태 변경
            readEepromData={readEepromData}
            onReadEepromDataChange={setReadEepromData}
            needleTipConnected={needleTipConnected}
            websocket={ws} // WebSocket 연결 전달
            isWsConnected={isWsConnected} // WebSocket 연결 상태 전달
            onWaitingEepromReadChange={setIsWaitingEepromRead} // EEPROM 읽기 대기 상태 변경 함수 전달
            calculatedMotorPosition={calculatedMotorPosition} // 계산된 모터 위치 전달
            onMtrVersionChange={setMtrVersion} // MTR 버전 변경 콜백 함수 전달
            selectedNeedleType={selectedNeedleType} // 선택된 니들 타입 전달
            onSelectedNeedleTypeChange={setSelectedNeedleType} // 선택된 니들 타입 변경 콜백 함수 전달
            needleOffset1={needleOffset1} // 모터 1 니들 오프셋 전달
            needleProtrusion1={needleProtrusion1} // 모터 1 니들 돌출부분 전달
            needleOffset2={needleOffset2} // 모터 2 니들 오프셋 전달
            needleProtrusion2={needleProtrusion2} // 모터 2 니들 돌출부분 전달
            needleSpeed2={needleSpeed2} // 모터 2 니들 속도 전달
            isDecelerationEnabled={isDecelerationEnabled} // 감속 활성화 여부 전달
            decelerationPosition={decelerationPosition} // 감속 위치 전달
            decelerationSpeed={decelerationSpeed} // 감속 스피드 전달
            resistanceThreshold={resistanceThreshold} // 저항 임계값 전달
            onResistanceAbnormalChange={setIsResistanceAbnormal} // 저항 이상 상태 변경 함수 전달
            onResistance1Change={setResistance1} // 저항1 값 변경 함수 전달
            onResistance2Change={setResistance2} // 저항2 값 변경 함수 전달
            onResistance1StatusChange={setResistance1Status} // 저항1 상태 변경 함수 전달
            onResistance2StatusChange={setResistance2Status} // 저항2 상태 변경 함수 전달
            gpio5State={gpio5State} // GPIO 5번 쇼트 체크 상태 전달
            motor2Position={motor2Position} // 실시간 모터2 위치 전달
          />
          </div>
          <div className="w-[26.5%]">
            {selectedNeedleType.startsWith('MULTI') && mtrVersion === '4.0' ? (
            <NeedleCheckPanelV4Multi 
              mode={mode} 
              isMotorConnected={isMotorConnected}
              needlePosition={needlePosition}
              onNeedleUp={handleNeedleUp}
              onNeedleDown={handleNeedleDown}
              websocket={ws}
              isWsConnected={isWsConnected}
              onMotorPositionChange={setCalculatedMotorPosition}
              resistance1={resistance1}
              resistance2={resistance2}
              resistance1Status={resistance1Status}
              resistance2Status={resistance2Status}
              isResistanceMeasuring={isResistanceMeasuring}
              onResistanceMeasuringChange={setIsResistanceMeasuring}
              needleOffset1={needleOffset1}
              onNeedleOffset1Change={setNeedleOffset1}
              needleProtrusion1={needleProtrusion1}
              onNeedleProtrusion1Change={setNeedleProtrusion1}
              needleOffset2={needleOffset2}
              onNeedleOffset2Change={setNeedleOffset2}
              needleProtrusion2={needleProtrusion2}
              onNeedleProtrusion2Change={setNeedleProtrusion2}
              resistanceThreshold={resistanceThreshold}
              onResistanceThresholdChange={setResistanceThreshold}
              needleSpeed2={needleSpeed2}
              onNeedleSpeed2Change={setNeedleSpeed2}
              isDecelerationEnabled={isDecelerationEnabled}
              onDecelerationEnabledChange={setIsDecelerationEnabled}
              decelerationPosition={decelerationPosition}
              onDecelerationPositionChange={setDecelerationPosition}
              decelerationSpeed={decelerationSpeed}
              onDecelerationSpeedChange={setDecelerationSpeed}
            />
          ) : (
            <NeedleCheckPanel 
              mode={mode} 
              isMotorConnected={isMotorConnected}
              needlePosition={needlePosition}
              onNeedleUp={handleNeedleUp}
              onNeedleDown={handleNeedleDown}
              websocket={ws}
              isWsConnected={isWsConnected}
              onMotorPositionChange={setCalculatedMotorPosition}
              needleOffset={needleOffset1}
              onNeedleOffsetChange={setNeedleOffset1}
              needleProtrusion={needleProtrusion1}
              onNeedleProtrusionChange={setNeedleProtrusion1}
            />
          )}
          </div>
          <div className="w-[22.5%]">
            <JudgePanel 
            ref={judgePanelRef} // GPIO 13번 PASS, 19번 NG 버튼용 ref 추가
            onJudge={(result) => console.log(`판정 결과: ${result}`)}
            isStarted={isStarted}
            onReset={handleJudgeReset}
            camera1Ref={cameraViewRef1} // camera1Ref 전달
            camera2Ref={cameraViewRef2} // camera2Ref 전달
            hasNeedleTip={needleTipConnected} // GPIO23 기반 니들팁 연결 상태 전달
            websocket={ws} // WebSocket 연결 전달
            isWsConnected={isWsConnected} // WebSocket 연결 상태 전달
            onCaptureMergedImage={captureMergedImage} // 병합 캡처 함수 전달
            eepromData={readEepromData} // EEPROM 데이터 전달
            generateUserBasedPath={generateUserBasedPath} // 사용자 기반 폴더 경로 생성 함수 전달
            isWaitingEepromRead={isWaitingEepromRead} // EEPROM 읽기 대기 상태 전달
            onWaitingEepromReadChange={setIsWaitingEepromRead} // EEPROM 읽기 대기 상태 변경 함수 전달
            isResistanceAbnormal={isResistanceAbnormal} // 저항 이상 상태 전달
            needleOffset1={needleOffset1} // 모터 1 초기 위치 전달
            needleOffset2={needleOffset2} // 모터 2 초기 위치 전달
            workStatus={workStatus} // 작업 상태 전달 (니들 쇼트 포함)
            onDebugModeChange={setIsDebugMode} // 디버깅 모드 변경 콜백 전달
            />
          </div>
        </div>
      </main>
    </div>
  )
}
