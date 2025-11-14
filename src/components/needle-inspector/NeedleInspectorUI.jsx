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
  const videoServerUrl = "http://127.0.0.1:5000"
  
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
  const [gpio11State, setGpio11State] = useState('UNKNOWN') // 니들팁 연결 상태
  const [gpio6State, setGpio6State] = useState('UNKNOWN') // START 버튼
  const [gpio13State, setGpio13State] = useState('UNKNOWN') // PASS 버튼
  const [gpio19State, setGpio19State] = useState('UNKNOWN') // NG 버튼
  
  // StatusPanel 상태 관리
  const [workStatus, setWorkStatus] = useState('waiting') // waiting, connected, disconnected, write_success, write_failed, needle_short
  
  // 데이터 설정 상태 (판정 시 EEPROM 쓰기를 위해 필요)
  const [dataSettings, setDataSettings] = useState(null)
  
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
  
  // 모터 1 설정값 (NeedleCheckPanelV4Multi에서 사용)
  const [needleSpeed1, setNeedleSpeed1] = useState(1000) // 모터 1 니들 속도
  
  // 모터 2 설정값 (NeedleCheckPanelV4에서 사용)
  const [needleOffset2, setNeedleOffset2] = useState(50) // 모터 2 니들 오프셋
  const [needleProtrusion2, setNeedleProtrusion2] = useState(30) // 모터 2 니들 돌출부분
  const [needleSpeed2, setNeedleSpeed2] = useState(1000) // 모터 2 니들 속도
  const [isDecelerationEnabled, setIsDecelerationEnabled] = useState(false) // 감속 활성화 여부
  const [decelerationPosition, setDecelerationPosition] = useState(5.0) // 감속 위치 (목표 위치에서 얼마나 떨어진 지점에서 감속할지, mm 단위)
  const [decelerationSpeed, setDecelerationSpeed] = useState(100) // 감속 스피드
  const [resistanceThreshold, setResistanceThreshold] = useState(100) // 저항 임계값 (정상값)
  const [isResistanceAbnormal, setIsResistanceAbnormal] = useState(false) // 저항 이상 여부
  const [isNeedleShortFixed, setIsNeedleShortFixed] = useState(false) // START 시점 니들 쇼트 고정 상태
  const [motor2TargetPosition, setMotor2TargetPosition] = useState(0) // 모터2 목표 위치 (감속 로직용)
  const [hasDecelerated, setHasDecelerated] = useState(false) // 감속 실행 여부
  
  // 카메라 서버 준비 상태
  const [isCameraServerReady, setIsCameraServerReady] = useState(false) // 카메라 서버 준비 완료 여부

  // 저항 측정 상태 (MTR 4.0에서만 사용)
  const [resistance1, setResistance1] = useState(NaN)
  const [resistance2, setResistance2] = useState(NaN)
  const [resistance1Status, setResistance1Status] = useState('N/A')
  const [resistance2Status, setResistance2Status] = useState('N/A')
  const [isResistanceMeasuring, setIsResistanceMeasuring] = useState(false)

  // 명령어 큐 상태 (디버깅용)
  const [commandQueueSize, setCommandQueueSize] = useState(0)


  // 카메라 관련
  const [referenceNaturalWidth1, setReferenceNaturalWidth1] = useState(1920);
  const [referenceNaturalWidth2, setReferenceNaturalWidth2] = useState(1920);


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
  
  // workStatus 변경 시 LED 제어 (오류 사운드는 StatusPanel에서 처리)
  useEffect(() => {
    if (!ws || !isWsConnected) return;
    
    // 오류 상황들에서 LED RED 켜기
    const errorStatuses = ['motor_error', 'needle_short', 'write_failed', 'read_failed', 'resistance_abnormal'];
    
    if (errorStatuses.includes(workStatus)) {
      console.log(`🔴 오류 발생 (${workStatus}) - LED RED 켜기`);
      
      // LED RED 켜기
      ws.send(JSON.stringify({
        cmd: "led_control",
        type: "red"
      }));
    }
  }, [workStatus, ws, isWsConnected]);
  
  // Camera 1 상태
  const [drawMode1, setDrawMode1] = useState(false)
  const [selectedIndex1, setSelectedIndex1] = useState(-1)
  const [lineInfo1, setLineInfo1] = useState('선 정보: 없음')
  const [calibrationValue1, setCalibrationValue1] = useState(19.8) // 실측 캘리브레이션 값 (99px = 5mm)
  const [selectedLineColor1, setSelectedLineColor1] = useState('red') // 선택된 선 색상 (red, cyan)
  const canvasRef1 = useRef(null)
  const videoContainerRef1 = useRef(null)
  const cameraViewRef1 = useRef(null) // CameraView ref 추가
  const [referenceCanvasWidth1, setReferenceCanvasWidth1] = useState(640);


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
  const [referenceCanvasWidth2, setReferenceCanvasWidth2] = useState(640);


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
  
  // 드래그 중 임시 라인 데이터를 저장하는 ref (리렌더링 방지)
  const dragTempLines1 = useRef(null)
  const dragTempLines2 = useRef(null)

  // 카메라 이미지를 캡처하는 함수 (1개 또는 2개 카메라 지원)
  const captureMergedImage = async (judgeResult = null, eepromData = null) => {
    try {
      console.log('🔄 카메라 이미지 캡처 시작...');

      // 니들 타입에 따른 저항 데이터 준비
      const isMultiNeedle = mtrVersion === '4.0' && selectedNeedleType && selectedNeedleType.startsWith('MULTI');
      const resistanceData = isMultiNeedle ? {
        resistance1: resistance1,
        resistance2: resistance2
      } : null; // 일반 니들은 저항 데이터 제외

      console.log(`🔍 니들 타입: ${selectedNeedleType}, MTR: ${mtrVersion}, 저항 데이터 포함: ${isMultiNeedle}`);

      // 카메라 이미지 캡처 (정보 오버레이 없이)
      const camera1Image = await cameraViewRef1.current?.captureImage(null, null, null); // 정보 없이 순수 이미지만

      if (!camera1Image) {
        console.error('❌ Camera 1 이미지 캡처 실패');
        return null;
      }

      // Camera 2 이미지 캡처 시도 (선택적)
      let camera2Image = null;
      try {
        camera2Image = await cameraViewRef2.current?.captureImage(null, null, null);
        if (camera2Image) {
          console.log('✅ Camera 2 이미지 캡처 성공');
        } else {
          console.log('ℹ️ Camera 2 이미지 없음 (단일 카메라 모드)');
        }
      } catch (err) {
        console.log('ℹ️ Camera 2 캡처 실패 또는 미연결 (단일 카메라 모드)');
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

      // 이미지 로드
      const img1 = await loadImage(camera1Image);
      let img2 = null;
      if (camera2Image) {
        img2 = await loadImage(camera2Image);
      }
      
      // 정보 표시용 상단 프레임 높이 계산 (저항 정보까지 포함하여 충분한 공간 확보)
      const infoFrameHeight = 100; // 상단 정보 프레임 높이

      // 캔버스 생성 (상단 프레임 + 이미지)
      const mergedCanvas = document.createElement('canvas');
      const ctx = mergedCanvas.getContext('2d');

      // 캔버스 크기 설정
      if (img2) {
        // 2-카메라 모드: 두 이미지를 가로로 배치
        mergedCanvas.width = img1.width + img2.width;
        mergedCanvas.height = Math.max(img1.height, img2.height) + infoFrameHeight;
        console.log('✅ 2-카메라 모드로 캔버스 생성');
      } else {
        // 단일 카메라 모드: 한 이미지만 사용
        mergedCanvas.width = img1.width;
        mergedCanvas.height = img1.height + infoFrameHeight;
        console.log('✅ 단일 카메라 모드로 캔버스 생성');
      }

      // 전체 배경을 검은색으로 채우기
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, mergedCanvas.width, mergedCanvas.height);

      // 상단 정보 프레임 영역 (더 진한 검은색 배경)
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, mergedCanvas.width, infoFrameHeight);

      // 상단 프레임과 이미지 영역 구분선
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, infoFrameHeight);
      ctx.lineTo(mergedCanvas.width, infoFrameHeight);
      ctx.stroke();

      // 첫 번째 이미지 그리기 (왼쪽 또는 전체, 상단 프레임 아래)
      ctx.drawImage(img1, 0, infoFrameHeight);

      // 두 번째 이미지가 있으면 그리기
      if (img2) {
        // 두 번째 이미지 그리기 (오른쪽, 상단 프레임 아래)
        ctx.drawImage(img2, img1.width, infoFrameHeight);

        // 이미지 간 구분선 그리기
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(img1.width, infoFrameHeight);
        ctx.lineTo(img1.width, mergedCanvas.height);
        ctx.stroke();
      }
      
      // 상단 프레임에 통합 정보 표시
      if (judgeResult) {
        const now = new Date();
        const timeText = now.toLocaleString();
        
        // 텍스트 스타일 설정
        ctx.font = "bold 16px Arial";
        ctx.lineWidth = 2;
        
        let infoText = '';
        
        // EEPROM 정보 구성
        if (eepromData) {
          if (workStatus === 'needle_short') {
            infoText = `EEPROM | TIP:${eepromData.tipType} | SHOT:${eepromData.shotCount} | DATE:${eepromData.year}-${String(eepromData.month).padStart(2, '0')}-${String(eepromData.day).padStart(2, '0')} | MAKER:${eepromData.makerCode} | 니들 쇼트 | ${judgeResult}`;
          } else {
            infoText = `EEPROM | TIP:${eepromData.tipType} | SHOT:${eepromData.shotCount} | DATE:${eepromData.year}-${String(eepromData.month).padStart(2, '0')}-${String(eepromData.day).padStart(2, '0')} | MAKER:${eepromData.makerCode} | ${judgeResult}`;
          }
        } else {
          if (workStatus === 'needle_short') {
            infoText = `니들 쇼트 ${judgeResult}`;
          } else {
            infoText = `EEPROM 데이터 읽기 실패 ${judgeResult}`;
          }
        }
        
        // 저항 데이터 추가 (두 번째 줄)
        let resistanceText = '';
        if (resistanceData && (resistanceData.resistance1 !== undefined || resistanceData.resistance2 !== undefined)) {
          const r1 = isNaN(resistanceData.resistance1) ? 'NaN' : (0.001 * resistanceData.resistance1).toFixed(3);
          const r2 = isNaN(resistanceData.resistance2) ? 'NaN' : (0.001 * resistanceData.resistance2).toFixed(3);
          resistanceText = `저항 측정 | R1: ${r1}Ω | R2: ${r2}Ω | 임계값: ${(resistanceThreshold).toFixed(1)}Ω`;
        }
        
        // 판정 결과에 따른 색상 설정
        if (judgeResult === 'PASS') {
          ctx.fillStyle = "lime";
          ctx.strokeStyle = "darkgreen";
        } else if (judgeResult === 'NG') {
          ctx.fillStyle = "red";
          ctx.strokeStyle = "darkred";
        } else {
          ctx.fillStyle = "yellow";
          ctx.strokeStyle = "black";
        }
        
        // 첫 번째 줄: EEPROM 정보 (상단 중앙)
        const textX = 10;
        ctx.strokeText(infoText, textX, 30);
        ctx.fillText(infoText, textX, 30);
        
        // 두 번째 줄: 저항 정보 (있는 경우)
        if (resistanceText) {
          ctx.strokeText(resistanceText, textX, 55);
          ctx.fillText(resistanceText, textX, 55);
        }
        
        // 시간 정보 (오른쪽 상단)
        ctx.font = "bold 14px Arial";
        ctx.fillStyle = "yellow";
        ctx.strokeStyle = "black";
        const timeMetrics = ctx.measureText(timeText);
        const timeX = mergedCanvas.width - timeMetrics.width - 10;
        ctx.strokeText(timeText, timeX, 30);
        ctx.fillText(timeText, timeX, 30);
        
        console.log('✅ 상단 프레임에 통합 정보 표시 완료');
      }
      
      // 이미지 데이터 생성
      const mergedDataURL = mergedCanvas.toDataURL('image/png');

      console.log(`✅ 카메라 이미지 캡처 완료 (${img2 ? '2-카메라' : '단일 카메라'} 모드)`);
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
  const generateUserBasedPath = async (judgeResult, eepromData = null) => {
    // EEPROM 데이터에서 제조일 추출, 없으면 현재 날짜 사용
    let workDate;
    if (eepromData && eepromData.year && eepromData.month && eepromData.day) {
      // EEPROM의 제조일 사용
      const year = eepromData.year;
      const month = String(eepromData.month).padStart(2, '0');
      const day = String(eepromData.day).padStart(2, '0');
      workDate = `${year}-${month}-${day}`; // YYYY-MM-DD
      console.log(`📅 EEPROM 제조일 사용: ${workDate}`);
    } else {
      // EEPROM 데이터가 없으면 현재 날짜 사용 (fallback)
      const today = new Date();
      workDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      console.log(`📅 EEPROM 데이터 없음, 현재 날짜 사용: ${workDate}`);
    }

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


const drawLineWithInfo = (ctx, line, color, showText, calibrationValue = 19.8, isSelected = false, imageNaturalWidth = 1920) => {
  const canvas = ctx.canvas;
  if (!canvas) {
    console.error("drawLineWithInfo: 캔버스 객체를 찾을 수 없습니다.", ctx);
    return { length: '0.0', mm: '0.00', angle: '0.00' };
  }

  // 현재 캔버스 크기와 기준 크기의 비율 계산
  const scaleRatio = canvas.width / imageNaturalWidth;
  // 조정된 캘리브레이션 값 계산
  const adjustedCalibration = calibrationValue * scaleRatio;
  
  const { relX1, relY1, relX2, relY2, relLabelX, relLabelY } = line;
  const isRelative = relX1 !== undefined;

  const x1 = isRelative ? relX1 * canvas.width : line.x1;
  const y1 = isRelative ? relY1 * canvas.height : line.y1;
  const x2 = isRelative ? relX2 * canvas.width : line.x2;
  const y2 = isRelative ? relY2 * canvas.height : line.y2;
  
  if (ctx && ctx.moveTo) {
    const lineColor = isSelected ? '#ffff00' : color;
    ctx.strokeStyle = lineColor;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    const dx_abs = x2 - x1;
    const dy_abs = y2 - y1;
    const length_abs = Math.sqrt(dx_abs * dx_abs + dy_abs * dy_abs);
    const perpLength = 14;
    
    const perpX = length_abs === 0 ? 0 : -dy_abs / length_abs * perpLength;
    const perpY = length_abs === 0 ? 0 : dx_abs / length_abs * perpLength;
    
    ctx.beginPath();
    ctx.moveTo(x1 - perpX / 2, y1 - perpY / 2);
    ctx.lineTo(x1 + perpX / 2, y1 + perpY / 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(x2 - perpX / 2, y2 - perpY / 2);
    ctx.lineTo(x2 + perpX / 2, y2 + perpY / 2);
    ctx.stroke();

    // 선택된 선의 경우 가운데 핸들 그리기 (보라색 테두리)
    if (isSelected) {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      // 가운데 핸들을 선을 따라 늘리기 (기본 14px -> 40px)
      const midHandleLength = 40;
      const midPerpX = length_abs === 0 ? 0 : -dy_abs / length_abs * midHandleLength;
      const midPerpY = length_abs === 0 ? 0 : dx_abs / length_abs * midHandleLength;

      // 보라색 테두리로 가운데 핸들 그리기
      ctx.strokeStyle = '#a855f7'; // 보라색
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(midX - midPerpX / 2, midY - midPerpY / 2);
      ctx.lineTo(midX + midPerpX / 2, midY + midPerpY / 2);
      ctx.stroke();

      // 원래 색상과 라인 너비로 복원
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = isSelected ? 3 : 2;
    }

    if (showText) {
      // 조정된 캘리브레이션 값 사용
      const mm = length_abs / adjustedCalibration;
      let angle = Math.atan2(dy_abs, dx_abs) * 180 / Math.PI;
      if (Object.is(angle, -0)) {
        angle = 0;
      }
      const text = `${length_abs.toFixed(1)}px / ${mm.toFixed(2)}mm (${angle.toFixed(1)}°)`;
      
      const textX = (isRelative && relLabelX !== undefined)
        ? (relLabelX * canvas.width)
        : (x1 + x2) / 2 + 5;
      
      const textY = (isRelative && relLabelY !== undefined)
        ? (relLabelY * canvas.height)
        : (y1 + y2) / 2 - 5;
      
      ctx.font = '14px Arial';
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 16;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(textX - 2, textY - textHeight + 2, textWidth + 4, textHeight + 2);
      
      if (isSelected) {
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(textX - 2, textY - textHeight + 2, textWidth + 4, textHeight + 2);
      }
      
      ctx.fillStyle = lineColor;
      ctx.fillText(text, textX, textY);
    }
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  // 조정된 캘리브레이션 값 사용
  const mm = length / adjustedCalibration;
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (Object.is(angle, -0)) {
    angle = 0;
  }

  return { length: length.toFixed(1), mm: mm.toFixed(2), angle: angle.toFixed(1) };
}


// 기존 선의 모든 점에 스냅하는 함수 (canvas 인자 추가)
  const snapToExistingLines = (pos, lines, snapDistance = 15, canvas) => {
    let snappedPos = { ...pos }
    let minDistance = snapDistance
    
    lines.forEach(line => {
      // 1. 상대 좌표를 절대 좌표로 변환
      const { relX1, relY1, relX2, relY2 } = line;
      // 캔버스가 없거나, relX1이 없는 구 형식 데이터는 스냅하지 않음
      if (relX1 === undefined || !canvas) return; 

      const x1 = relX1 * canvas.width;
      const y1 = relY1 * canvas.height;
      const x2 = relX2 * canvas.width;
      const y2 = relY2 * canvas.height;

      // 선의 시작점과 끝점
      const dx = x2 - x1
      const dy = y2 - y1
      const lineLength = Math.sqrt(dx * dx + dy * dy)
      
      if (lineLength === 0) return // 길이가 0인 선은 무시
      
      // 2. 마우스 위치(pos)에서 선까지의 가장 가까운 점 계산 (이후 로직은 수정 불필요)
      const t = Math.max(0, Math.min(1, ((pos.x - x1) * dx + (pos.y - y1) * dy) / (lineLength * lineLength)))
      const closestX = x1 + t * dx
      const closestY = y1 + t * dy
      
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

// 선 클릭 감지 함수 (canvas 인자 추가)
  const isPointOnLine = (point, line, tolerance = 20, canvas) => {
    // 1. 상대 좌표를 절대 좌표로 변환
    const { relX1, relY1, relX2, relY2 } = line;
    // 캔버스가 없거나, relX1이 없는 구 형식 데이터는 클릭되지 않음
    if (relX1 === undefined || !canvas) return false; 

    const x1 = relX1 * canvas.width;
    const y1 = relY1 * canvas.height;
    const x2 = relX2 * canvas.width;
    const y2 = relY2 * canvas.height;
    
    const { x, y } = point; // point는 이미 절대 좌표

    // 2. 점에서 선분까지의 거리 계산 (이후 로직은 수정 불필요)
    const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if (lineLength === 0) return false

    // 점에서 선분까지의 거리 계산
    const distance = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / lineLength

    // 점이 선분의 범위 내에 있는지 확인
    const dotProduct = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (lineLength ** 2)
    const isInRange = dotProduct >= 0 && dotProduct <= 1

    return distance <= tolerance && isInRange
  }

// 가운데 핸들 위에 있는지 확인하는 함수
  const isPointOnMiddleHandle = (pos, line, tolerance = 25, canvas) => {
    if (!canvas || line.relX1 === undefined) return false;

    // 상대 좌표를 절대 좌표로 변환
    const x1 = line.relX1 * canvas.width;
    const y1 = line.relY1 * canvas.height;
    const x2 = line.relX2 * canvas.width;
    const y2 = line.relY2 * canvas.height;

    // 선의 가운데 지점
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    // 가운데 핸들 영역 (40px 핸들 + tolerance)
    const midHandleLength = 40;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength === 0) return false;

    // 핸들의 수직 방향 벡터
    const midPerpX = -dy / lineLength * midHandleLength;
    const midPerpY = dx / lineLength * midHandleLength;

    // 핸들의 양 끝 지점
    const handleX1 = midX - midPerpX / 2;
    const handleY1 = midY - midPerpY / 2;
    const handleX2 = midX + midPerpX / 2;
    const handleY2 = midY + midPerpY / 2;

    // 점에서 핸들 선분까지의 거리 계산
    const handleDx = handleX2 - handleX1;
    const handleDy = handleY2 - handleY1;
    const handleLength = Math.sqrt(handleDx * handleDx + handleDy * handleDy);

    if (handleLength === 0) return false;

    const t = Math.max(0, Math.min(1, ((pos.x - handleX1) * handleDx + (pos.y - handleY1) * handleDy) / (handleLength * handleLength)));
    const closestX = handleX1 + t * handleDx;
    const closestY = handleY1 + t * handleDy;
    const distance = Math.sqrt(Math.pow(pos.x - closestX, 2) + Math.pow(pos.y - closestY, 2));

    return distance <= tolerance;
  };

// 라벨 클릭 감지 함수 (canvas 인자 추가)
  const isPointOnLabel = (point, line, calibrationValue = 19.8, canvas) => {
    // 1. 상대 좌표를 절대 좌표로 변환
    const { relX1, relY1, relX2, relY2, relLabelX, relLabelY } = line;
    // 캔버스가 없거나, relX1이 없는 구 형식 데이터는 클릭되지 않음
    if (relX1 === undefined || !canvas) return false; 

    const x1 = relX1 * canvas.width;
    const y1 = relY1 * canvas.height;
    const x2 = relX2 * canvas.width;
    const y2 = relY2 * canvas.height;

    const { x, y } = point; // point는 이미 절대 좌표

    // 2. 라벨 위치 계산 (변환된 좌표 사용)
    //    저장된 라벨 상대 위치(relLabelX)가 있으면 사용, 없으면 선의 중간을 사용
    const textX = relLabelX !== undefined ? (relLabelX * canvas.width) : (x1 + x2) / 2 + 5
    const textY = relLabelY !== undefined ? (relLabelY * canvas.height) : (y1 + y2) / 2 - 5

    // 3. 라벨 텍스트 크기 계산 (이후 로직은 수정 불필요)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    const mm = length / calibrationValue
    let angle = Math.atan2(dy, dx) * 180 / Math.PI
    if (Object.is(angle, -0)) {
      angle = 0;
    }
    const text = `${length.toFixed(1)}px / ${mm.toFixed(2)}mm (${angle.toFixed(1)}°)`;
    
    // 대략적인 텍스트 크기 (14px Arial 기준)
    // (참고: 정확도를 높이려면 이 계산을 drawLineWithInfo처럼 canvas.getContext('2d').measureText를 써야 하지만,
    //  클릭 감지용이므로 대략적인 계산도 대부분 잘 동작합니다.)
    const textWidth = text.length * 8 // 대략적인 계산
    const textHeight = 16

    // 4. 라벨 영역 내에 있는지 확인
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
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef1.current;
      if (!canvas) return;
      const pos = getMousePos(canvas, e);
      
      if (drawMode1) {
        setStartPoint1(pos);
        setIsDrawing1(true);
        return;
      }

      // 라벨 클릭 감지 (우선순위: 라벨 > 선)
      for (let i = lines1.length - 1; i >= 0; i--) {
        // 2. 헬퍼 함수에 canvas 전달
        if (isPointOnLabel(pos, lines1[i], calibrationValue1, canvas)) {
          setSelectedIndex1(i);
          setIsDraggingLabel1(true);
          setDraggingLabelIndex1(i);
          
          // 3. 라벨 드래그 오프셋 계산 (상대좌표 -> 절대좌표 변환 후 계산)
          const line = lines1[i];
          const textX = (line.relLabelX !== undefined) ? (line.relLabelX * canvas.width) : (line.relX1 * canvas.width + line.relX2 * canvas.width) / 2 + 5;
          const textY = (line.relLabelY !== undefined) ? (line.relLabelY * canvas.height) : (line.relY1 * canvas.height + line.relY2 * canvas.height) / 2 - 5;
          setLabelDragOffset1({ x: pos.x - textX, y: pos.y - textY });
          
          // 4. 정보 계산 시 { canvas: canvas } 전달
          const lineData = drawLineWithInfo({ canvas: canvas }, lines1[i], lines1[i].color || 'red', false, calibrationValue1);
          setLineInfo1(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`);
          redrawCanvas1();
          return;
        }
      }

      // 선 클릭 감지
      for (let i = lines1.length - 1; i >= 0; i--) {
        // 2. 헬퍼 함수에 canvas 전달
        if (isPointOnLine(pos, lines1[i], 20, canvas)) {
          setSelectedIndex1(i);
          // 4. 정보 계산 시 { canvas: canvas } 전달
          const lineData = drawLineWithInfo({ canvas: canvas }, lines1[i], lines1[i].color || 'red', false, calibrationValue1);
          setLineInfo1(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`);
          redrawCanvas1();
          return;
        }
      }
      setSelectedIndex1(-1);
      setLineInfo1('선 정보: 없음');
      redrawCanvas1();
    },
    handleMouseMove: (e) => {
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef1.current;
      if (!canvas) return;
      const currentPos = getMousePos(canvas, e);

      // 라벨 드래그 중인 경우
      if (isDraggingLabel1 && draggingLabelIndex1 >= 0) {
        // 드래그 시작 시 한 번만 임시 배열 생성
        if (!dragTempLines1.current) {
          dragTempLines1.current = [...lines1];
        }

        const newLabelX_abs = currentPos.x - labelDragOffset1.x; // 새 절대 X
        const newLabelY_abs = currentPos.y - labelDragOffset1.y; // 새 절대 Y

        // 5. 임시 배열의 라벨 위치만 업데이트
        dragTempLines1.current[draggingLabelIndex1] = {
          ...dragTempLines1.current[draggingLabelIndex1],
          relLabelX: newLabelX_abs / canvas.width,
          relLabelY: newLabelY_abs / canvas.height
        };

        // 드래그 중에는 임시 배열로만 그리기 (state 업데이트 없음)
        redrawCanvas1(dragTempLines1.current);
        return;
      }

      // 가운데 핸들 위에 마우스가 있는지 확인하고 커서 변경
      if (!drawMode1 && !isDrawing1 && selectedIndex1 >= 0) {
        const selectedLine = lines1[selectedIndex1];
        if (selectedLine && isPointOnMiddleHandle(currentPos, selectedLine, 25, canvas)) {
          canvas.style.cursor = 'grab';
          return;
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }

      // 선 그리기 모드
      if (!drawMode1 || !isDrawing1 || !startPoint1) return;
      
      // 2. 헬퍼 함수에 canvas 전달
      const lineSnappedPos = snapToExistingLines(currentPos, lines1, 15, canvas);
      const snappedPos = snapAngle(startPoint1, lineSnappedPos);
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 기존 선들 그리기
      drawLines(ctx, lines1, selectedIndex1, calibrationValue1);
      
      // 임시 선 그리기 (H 형태) - 절대 좌표 사용
      const tempLine = { x1: startPoint1.x, y1: startPoint1.y, x2: snappedPos.x, y2: snappedPos.y };
      ctx.lineWidth = 2;
      drawLineWithInfo(ctx, tempLine, selectedLineColor1, true, calibrationValue1);
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath();
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'yellow';
        ctx.fill();
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    handleMouseUp: (e) => {
      // 라벨 드래그 종료
      if (isDraggingLabel1) {
        // 드래그 종료 시 최종 위치를 state에 반영
        if (dragTempLines1.current) {
          setLines1(dragTempLines1.current);
          dragTempLines1.current = null; // 임시 데이터 초기화
        }
        
        setIsDraggingLabel1(false);
        setDraggingLabelIndex1(-1);
        return;
      }
      
      // 기존 라벨 드래그가 아닌 경우의 자동 저장 코드는 제거
      
      if (!drawMode1 || !isDrawing1 || !startPoint1) return;
      
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef1.current;
      if (!canvas) return;
      const currentPos = getMousePos(canvas, e);
      
      // 2. 헬퍼 함수에 canvas 전달
      const lineSnappedPos = snapToExistingLines(currentPos, lines1, 15, canvas);
      const snappedPos = snapAngle(startPoint1, lineSnappedPos);
      
      // 선의 길이 계산 (최소 길이 체크)
      const lineLength = Math.sqrt(
        Math.pow(snappedPos.x - startPoint1.x, 2) + 
        Math.pow(snappedPos.y - startPoint1.y, 2)
      );
      
      // 최소 길이 1픽셀 미만이면 선 생성하지 않음
      if (lineLength < 1) {
        console.log(`⚠️ 선이 너무 짧습니다 (${lineLength.toFixed(1)}px). 최소 1px 이상이어야 합니다.`);
        setIsDrawing1(false);
        setStartPoint1(null);
        setDrawMode1(false);
        redrawCanvas1(); // 임시선 지우기
        return;
      }
      
      // 6. 새 선을 상대 좌표로 변환하여 저장
      const newLine = { 
        relX1: startPoint1.x / canvas.width, 
        relY1: startPoint1.y / canvas.height, 
        relX2: snappedPos.x / canvas.width, 
        relY2: snappedPos.y / canvas.height, 
        color: selectedLineColor1 
      };
      const newLines = [...lines1, newLine];
      setLines1(newLines);

      setIsDrawing1(false);
      setStartPoint1(null);
      setDrawMode1(false);
      setSelectedIndex1(newLines.length - 1);
      
      // 4. 정보 계산 시 { canvas: canvas }와 새 상대좌표 line 전달
      const lineData = drawLineWithInfo({ canvas: canvas }, newLine, selectedLineColor1, false, calibrationValue1);
      setLineInfo1(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`);
    },
    handleDeleteLine: () => {
      if (selectedIndex1 >= 0 && selectedIndex1 < lines1.length) {
        const newLines = lines1.filter((_, index) => index !== selectedIndex1);
        setLines1(newLines);
        setSelectedIndex1(-1);
        setLineInfo1('선 정보: 없음');
        redrawCanvas1();
      }
    },
    handleDeleteAllLines: () => {
      setLines1([]);
      setSelectedIndex1(-1);
      setLineInfo1('선 정보: 없음');
      
      // 캔버스 클리어
      const canvas = canvasRef1.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  // Camera 2 핸들러들
  const handlers2 = {
    handleMouseDown: (e) => {
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef2.current;
      if (!canvas) return;
      const pos = getMousePos(canvas, e);
      
      if (drawMode2) {
        setStartPoint2(pos);
        setIsDrawing2(true);
        return;
      }

      // 라벨 클릭 감지 (우선순위: 라벨 > 선)
      for (let i = lines2.length - 1; i >= 0; i--) {
        // 2. 헬퍼 함수에 canvas 전달
        if (isPointOnLabel(pos, lines2[i], calibrationValue2, canvas)) {
          setSelectedIndex2(i);
          setIsDraggingLabel2(true);
          setDraggingLabelIndex2(i);
          
          // 3. 라벨 드래그 오프셋 계산 (상대좌표 -> 절대좌표 변환 후 계산)
          const line = lines2[i];
          const textX = (line.relLabelX !== undefined) ? (line.relLabelX * canvas.width) : (line.relX1 * canvas.width + line.relX2 * canvas.width) / 2 + 5;
          const textY = (line.relLabelY !== undefined) ? (line.relLabelY * canvas.height) : (line.relY1 * canvas.height + line.relY2 * canvas.height) / 2 - 5;
          setLabelDragOffset2({ x: pos.x - textX, y: pos.y - textY });
          
          // 4. 정보 계산 시 { canvas: canvas } 전달
          const lineData = drawLineWithInfo({ canvas: canvas }, lines2[i], lines2[i].color || 'red', false, calibrationValue2);
          setLineInfo2(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`);
          redrawCanvas2();
          return;
        }
      }

      // 선 클릭 감지
      for (let i = lines2.length - 1; i >= 0; i--) {
        // 2. 헬퍼 함수에 canvas 전달
        if (isPointOnLine(pos, lines2[i], 20, canvas)) {
          setSelectedIndex2(i);
          // 4. 정보 계산 시 { canvas: canvas } 전달
          const lineData = drawLineWithInfo({ canvas: canvas }, lines2[i], lines2[i].color || 'red', false, calibrationValue2);
          setLineInfo2(`선 ${i + 1}: ${lineData.mm}mm (${lineData.angle}°)`);
          redrawCanvas2();
          return;
        }
      }
      setSelectedIndex2(-1);
      setLineInfo2('선 정보: 없음');
      redrawCanvas2();
    },
    handleMouseMove: (e) => {
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef2.current;
      if (!canvas) return;
      const currentPos = getMousePos(canvas, e);

      // 라벨 드래그 중인 경우
      if (isDraggingLabel2 && draggingLabelIndex2 >= 0) {
        // 드래그 시작 시 한 번만 임시 배열 생성
        if (!dragTempLines2.current) {
          dragTempLines2.current = [...lines2];
        }

        const newLabelX_abs = currentPos.x - labelDragOffset2.x; // 새 절대 X
        const newLabelY_abs = currentPos.y - labelDragOffset2.y; // 새 절대 Y

        // 5. 임시 배열의 라벨 위치만 업데이트
        dragTempLines2.current[draggingLabelIndex2] = {
          ...dragTempLines2.current[draggingLabelIndex2],
          relLabelX: newLabelX_abs / canvas.width,
          relLabelY: newLabelY_abs / canvas.height
        };

        // 드래그 중에는 임시 배열로만 그리기 (state 업데이트 없음)
        redrawCanvas2(dragTempLines2.current);
        return;
      }

      // 가운데 핸들 위에 마우스가 있는지 확인하고 커서 변경
      if (!drawMode2 && !isDrawing2 && selectedIndex2 >= 0) {
        const selectedLine = lines2[selectedIndex2];
        if (selectedLine && isPointOnMiddleHandle(currentPos, selectedLine, 25, canvas)) {
          canvas.style.cursor = 'grab';
          return;
        } else {
          canvas.style.cursor = 'crosshair';
        }
      }

      // 선 그리기 모드
      if (!drawMode2 || !isDrawing2 || !startPoint2) return;
      
      // 2. 헬퍼 함수에 canvas 전달
      const lineSnappedPos = snapToExistingLines(currentPos, lines2, 15, canvas);
      const snappedPos = snapAngle(startPoint2, lineSnappedPos);
      
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // 기존 선들 그리기
      drawLines(ctx, lines2, selectedIndex2, calibrationValue2);
      
      // 임시 선 그리기 (H 형태) - 절대 좌표 사용
      const tempLine = { x1: startPoint2.x, y1: startPoint2.y, x2: snappedPos.x, y2: snappedPos.y };
      ctx.lineWidth = 2;
      drawLineWithInfo(ctx, tempLine, selectedLineColor2, true, calibrationValue2);
      
      // 스냅 포인트 표시 (작은 원으로 표시)
      if (lineSnappedPos.x !== currentPos.x || lineSnappedPos.y !== currentPos.y) {
        ctx.beginPath();
        ctx.arc(snappedPos.x, snappedPos.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'yellow';
        ctx.fill();
        ctx.strokeStyle = 'orange';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    },
    handleMouseUp: (e) => {
      // 라벨 드래그 종료
      if (isDraggingLabel2) {
        // 드래그 종료 시 최종 위치를 state에 반영
        if (dragTempLines2.current) {
          setLines2(dragTempLines2.current);
          dragTempLines2.current = null; // 임시 데이터 초기화
        }
        
        setIsDraggingLabel2(false);
        setDraggingLabelIndex2(-1);
        return;
      }
      
      // 기존 라벨 드래그가 아닌 경우의 자동 저장 코드는 제거
      
      if (!drawMode2 || !isDrawing2 || !startPoint2) return;
      
      // 1. 캔버스 객체 가져오기
      const canvas = canvasRef2.current;
      if (!canvas) return;
      const currentPos = getMousePos(canvas, e);
      
      // 2. 헬퍼 함수에 canvas 전달
      const lineSnappedPos = snapToExistingLines(currentPos, lines2, 15, canvas);
      const snappedPos = snapAngle(startPoint2, lineSnappedPos);
      
      // 선의 길이 계산 (최소 길이 체크)
      const lineLength = Math.sqrt(
        Math.pow(snappedPos.x - startPoint2.x, 2) + 
        Math.pow(snappedPos.y - startPoint2.y, 2)
      );
      
      // 최소 길이 1픽셀 미만이면 선 생성하지 않음
      if (lineLength < 1) {
        console.log(`⚠️ 선이 너무 짧습니다 (${lineLength.toFixed(1)}px). 최소 1px 이상이어야 합니다.`);
        setIsDrawing2(false);
        setStartPoint2(null);
        setDrawMode2(false);
        redrawCanvas2(); // 임시선 지우기
        return;
      }
      
      // 6. 새 선을 상대 좌표로 변환하여 저장
      const newLine = { 
        relX1: startPoint2.x / canvas.width, 
        relY1: startPoint2.y / canvas.height, 
        relX2: snappedPos.x / canvas.width, 
        relY2: snappedPos.y / canvas.height, 
        color: selectedLineColor2 
      };
      const newLines = [...lines2, newLine];
      setLines2(newLines);

      setIsDrawing2(false);
      setStartPoint2(null);
      setDrawMode2(false);
      setSelectedIndex2(newLines.length - 1);
      
      // 4. 정보 계산 시 { canvas: canvas }와 새 상대좌표 line 전달
      const lineData = drawLineWithInfo({ canvas: canvas }, newLine, selectedLineColor2, false, calibrationValue2);
      setLineInfo2(`선 ${newLines.length}: ${lineData.mm}mm (${lineData.angle}°)`);
    },
    handleDeleteLine: () => {
      if (selectedIndex2 >= 0 && selectedIndex2 < lines2.length) {
        const newLines = lines2.filter((_, index) => index !== selectedIndex2);
        setLines2(newLines);
        setSelectedIndex2(-1);
        setLineInfo2('선 정보: 없음');
        redrawCanvas2();
      }
    },
    handleDeleteAllLines: () => {
      setLines2([]);
      setSelectedIndex2(-1);
      setLineInfo2('선 정보: 없음');
      
      // 캔버스 클리어
      const canvas = canvasRef2.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

const drawLines = (ctx, lines, selectedIndex, calibrationValue, imageNaturalWidth) => {
  lines.forEach((line, index) => {
    const isSelected = index === selectedIndex;
    const lineColor = line.color || 'red';
    ctx.lineWidth = isSelected ? 3 : 2;
    drawLineWithInfo(ctx, line, lineColor, true, calibrationValue, isSelected, imageNaturalWidth);
  });
};

const redrawCanvas1 = (customLines = null) => {
  const canvas = canvasRef1.current;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 이미지 원본 크기 가져오기
  const img = videoContainerRef1.current?.querySelector('.camera-image');
  const naturalWidth = img?.naturalWidth || referenceNaturalWidth1;
  
  // 드래그 중이면 customLines 사용, 아니면 state의 lines1 사용
  const linesToDraw = customLines || lines1;
  drawLines(ctx, linesToDraw, selectedIndex1, calibrationValue1, naturalWidth);
};

const redrawCanvas2 = (customLines = null) => {
  const canvas = canvasRef2.current;
  if (!canvas || canvas.width === 0 || canvas.height === 0) return;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 이미지 원본 크기 가져오기
  const img = videoContainerRef2.current?.querySelector('.camera-image');
  const naturalWidth = img?.naturalWidth || referenceNaturalWidth2;
  
  // 드래그 중이면 customLines 사용, 아니면 state의 lines2 사용
  const linesToDraw = customLines || lines2;
  drawLines(ctx, linesToDraw, selectedIndex2, calibrationValue2, naturalWidth);
};

const resizeCanvas = (canvas, container, img) => {
  if (!canvas || !container) return;

  // 이미지가 로드되지 않았으면 스킵
  if (!img || img.naturalWidth === 0) {
    console.log(`⏳ [resizeCanvas] 이미지 아직 로드 안됨, 대기...`);
    return;
  }

  // 이전 캔버스 내용 저장
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  
  // 현재 캔버스 내용을 임시 캔버스에 복사
  if (canvas.width > 0 && canvas.height > 0) {
    tempCtx.drawImage(canvas, 0, 0);
  }

  const containerWidth = container.offsetWidth;
  const containerHeight = container.offsetHeight;
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;

  // object-fit: contain 계산
  const imgAspect = naturalWidth / naturalHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderedImgWidth, renderedImgHeight, offsetX, offsetY;

  if (imgAspect > containerAspect) {
    renderedImgWidth = containerWidth;
    renderedImgHeight = renderedImgWidth / imgAspect;
    offsetX = 0;
    offsetY = (containerHeight - renderedImgHeight) / 2;
  } else {
    renderedImgHeight = containerHeight;
    renderedImgWidth = renderedImgHeight * imgAspect;
    offsetX = (containerWidth - renderedImgWidth) / 2;
    offsetY = 0;
  }

  // 캔버스 크기 설정
  const prevWidth = canvas.width;
  const prevHeight = canvas.height;
  canvas.width = renderedImgWidth;
  canvas.height = renderedImgHeight;

  // 캔버스 위치 설정
  canvas.style.left = `${offsetX}px`;
  canvas.style.top = `${offsetY}px`;
  canvas.style.width = `${renderedImgWidth}px`;
  canvas.style.height = `${renderedImgHeight}px`;

  // 크기가 변경되었으면 선 다시 그리기
  if (prevWidth !== canvas.width || prevHeight !== canvas.height) {
    console.log(`✅ [resizeCanvas] 캔버스 크기 변경됨: ${prevWidth}x${prevHeight} → ${canvas.width}x${canvas.height}`);
    
    // requestAnimationFrame을 사용하여 다음 프레임에서 그리기
    requestAnimationFrame(() => {
      if (canvas.id === 'canvas-1') {
        redrawCanvas1();
      } else if (canvas.id === 'canvas-2') {
        redrawCanvas2();
      }
    });
  }
}

  // resizeAll 함수는 이제 "어떤 캔버스를 리사이즈 할지" 결정만 합니다.
  const resizeAll = () => {
    const img1 = videoContainerRef1.current?.querySelector('.camera-image');
    const img2 = videoContainerRef2.current?.querySelector('.camera-image');
    
    // resizeCanvas가 내부에 redrawCanvas 호출을 포함하도록 수정되었습니다.
    resizeCanvas(canvasRef1.current, videoContainerRef1.current, img1);
    resizeCanvas(canvasRef2.current, videoContainerRef2.current, img2);

    /*
    // 100ms 지연 및 이중 호출 제거
    setTimeout(() => {
      redrawCanvas1()
      redrawCanvas2()
    }, 100);
    */
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
// 캘리브레이션 저장 시 이미지의 natural 크기 사용
const saveCameraLinesData = async (cameraId, lines, calibrationValue, selectedLineColor) => {
  try {
    if (window.electronAPI && window.electronAPI.saveCameraLines) {
      // 이미지의 natural 크기 가져오기
      const container = cameraId === 1 ? videoContainerRef1.current : videoContainerRef2.current;
      const img = container?.querySelector('.camera-image');
      const referenceNaturalWidth = img ? img.naturalWidth : 1920; // 이미지 원본 크기
      
      const linesData = {
        lines: lines,
        calibrationValue: calibrationValue,
        referenceNaturalWidth: referenceNaturalWidth, // 이미지 원본 크기 기준
        selectedLineColor: selectedLineColor
      };
      
      console.log(`📐 캘리브레이션 저장 - 값: ${calibrationValue}px/mm, 이미지 원본 너비: ${referenceNaturalWidth}px`);
      
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
    referenceCanvasWidth: 640, // 기본 기준 너비 추가
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

  // 개별 카메라 수동 저장 핸들러
  const handleManualSave1 = async () => {
    try {
      console.log('💾 카메라 1 선 정보 수동 저장 시작...');
      const result = await saveCameraLinesData(1, lines1, calibrationValue1, selectedLineColor1);
      if (result && result.success) {
        console.log('✅ 카메라 1 선 정보 저장 완료');
      } else {
        console.error('❌ 카메라 1 선 정보 저장 실패');
      }
    } catch (error) {
      console.error('❌ 카메라 1 선 정보 저장 중 오류:', error);
    }
  };

  const handleManualSave2 = async () => {
    try {
      console.log('💾 카메라 2 선 정보 수동 저장 시작...');
      const result = await saveCameraLinesData(2, lines2, calibrationValue2, selectedLineColor2);
      if (result && result.success) {
        console.log('✅ 카메라 2 선 정보 저장 완료');
      } else {
        console.error('❌ 카메라 2 선 정보 저장 실패');
      }
    } catch (error) {
      console.error('❌ 카메라 2 선 정보 저장 중 오류:', error);
    }
  };

  // 개별 카메라 수동 로드 핸들러
  const handleManualLoad1 = async () => {
    try {
      console.log('📂 카메라 1 선 정보 수동 로드 시작...');
      const camera1Data = await loadCameraLinesData(1);

      if (camera1Data.lines && camera1Data.lines.length > 0) {
        if (camera1Data.lines[0].relX1 !== undefined) {
          setLines1([...camera1Data.lines]);
          console.log(`✅ 카메라 1 선 ${camera1Data.lines.length}개 로드 완료`);
        }
      } else {
        console.log('ℹ️ 카메라 1 저장된 선 정보 없음');
        setLines1([]);
      }

      if (camera1Data.calibrationValue) {
        setCalibrationValue1(camera1Data.calibrationValue);
        console.log(`📐 카메라 1 캘리브레이션 값: ${camera1Data.calibrationValue}`);
      }

      if (camera1Data.referenceNaturalWidth) {
        setReferenceCanvasWidth1(camera1Data.referenceNaturalWidth);
      } else {
        const img = videoContainerRef1.current?.querySelector('.camera-image');
        if (img && img.naturalWidth > 0) {
          setReferenceNaturalWidth1(img.naturalWidth);
        }
      }

      if (camera1Data.selectedLineColor) {
        setSelectedLineColor1(camera1Data.selectedLineColor);
        console.log(`🎨 카메라 1 선 색상: ${camera1Data.selectedLineColor}`);
      }

      // 로드 후 캔버스 다시 그리기
      setTimeout(() => {
        redrawCanvas1();
        console.log('✅ 카메라 1 캔버스 다시 그리기 완료');
      }, 100);
    } catch (error) {
      console.error('❌ 카메라 1 선 정보 로드 중 오류:', error);
    }
  };

  const handleManualLoad2 = async () => {
    try {
      console.log('📂 카메라 2 선 정보 수동 로드 시작...');
      const camera2Data = await loadCameraLinesData(2);

      if (camera2Data.lines && camera2Data.lines.length > 0) {
        if (camera2Data.lines[0].relX1 !== undefined) {
          setLines2([...camera2Data.lines]);
          console.log(`✅ 카메라 2 선 ${camera2Data.lines.length}개 로드 완료`);
        }
      } else {
        console.log('ℹ️ 카메라 2 저장된 선 정보 없음');
        setLines2([]);
      }

      if (camera2Data.calibrationValue) {
        setCalibrationValue2(camera2Data.calibrationValue);
        console.log(`📐 카메라 2 캘리브레이션 값: ${camera2Data.calibrationValue}`);
      }

      if (camera2Data.referenceNaturalWidth) {
        setReferenceNaturalWidth2(camera2Data.referenceNaturalWidth);
      } else {
        const img = videoContainerRef2.current?.querySelector('.camera-image');
        if (img && img.naturalWidth > 0) {
          setReferenceNaturalWidth2(img.naturalWidth);
        }
      }

      if (camera2Data.selectedLineColor) {
        setSelectedLineColor2(camera2Data.selectedLineColor);
        console.log(`🎨 카메라 2 선 색상: ${camera2Data.selectedLineColor}`);
      }

      // 로드 후 캔버스 다시 그리기
      setTimeout(() => {
        redrawCanvas2();
        console.log('✅ 카메라 2 캔버스 다시 그리기 완료');
      }, 100);
    } catch (error) {
      console.error('❌ 카메라 2 선 정보 로드 중 오류:', error);
    }
  };

const handleCalibrationChange1 = (newValue) => {
  setCalibrationValue1(newValue);
  
  // 이미지의 natural 크기를 기준으로 설정
  const img = videoContainerRef1.current?.querySelector('.camera-image');
  if (img && img.naturalWidth > 0) {
    const naturalWidth = img.naturalWidth;
    setReferenceNaturalWidth1(naturalWidth);
    
    // 현재 캔버스 크기에서 이미지 원본 크기 기준으로 변환
    const canvas = canvasRef1.current;
    if (canvas) {
      const currentToNaturalRatio = naturalWidth / canvas.width;
      const naturalBasedCalibration = newValue * currentToNaturalRatio;
    }
  }
};

const handleCalibrationChange2 = (newValue) => {
  setCalibrationValue2(newValue);
  
  // 이미지의 natural 크기를 기준으로 설정
  const img = videoContainerRef2.current?.querySelector('.camera-image');
  if (img && img.naturalWidth > 0) {
    const naturalWidth = img.naturalWidth;
    setReferenceNaturalWidth2(naturalWidth);
    
    // 현재 캔버스 크기에서 이미지 원본 크기 기준으로 변환
    const canvas = canvasRef2.current;
    if (canvas) {
      const currentToNaturalRatio = naturalWidth / canvas.width;
      const naturalBasedCalibration = newValue * currentToNaturalRatio;
    }
  }
};

  // 선 색상 변경 함수들
  const handleLineColorChange1 = (newColor) => {
    setSelectedLineColor1(newColor);
  };

  const handleLineColorChange2 = (newColor) => {
    setSelectedLineColor2(newColor);
  };

useEffect(() => {
  const setupCanvas = async () => {
    try {
      // 이미지가 완전히 로드될 때까지 대기
      const waitForImages = async () => {
        const maxAttempts = 20; // 최대 2초 대기 (100ms * 20)
        let attempts = 0;

        while (attempts < maxAttempts) {
          const img1 = videoContainerRef1.current?.querySelector('.camera-image');
          const img2 = videoContainerRef2.current?.querySelector('.camera-image');

          // 두 이미지 모두 로드되고 natural 크기가 있는지 확인
          if (img1?.naturalWidth > 0 && img2?.naturalWidth > 0) {
            console.log('✅ 이미지 로드 완료 - natural 크기:', {
              camera1: `${img1.naturalWidth}x${img1.naturalHeight}`,
              camera2: `${img2.naturalWidth}x${img2.naturalHeight}`
            });
            return true;
          }

          attempts++;
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.warn('⚠️ 이미지 로드 타임아웃 - 기본값으로 진행');
        return false;
      };

      // 이미지 로드 대기
      await waitForImages();

      // Canvas 크기 설정 (이미지가 로드된 후)
      const setupCanvasSize = () => {
        const img1 = videoContainerRef1.current?.querySelector('.camera-image');
        const img2 = videoContainerRef2.current?.querySelector('.camera-image');
        const canvas1 = canvasRef1.current;
        const canvas2 = canvasRef2.current;

        if (img1 && canvas1) {
          canvas1.width = img1.clientWidth;
          canvas1.height = img1.clientHeight;
          console.log(`📐 Canvas1 크기 설정: ${canvas1.width}x${canvas1.height}`);
        }

        if (img2 && canvas2) {
          canvas2.width = img2.clientWidth;
          canvas2.height = img2.clientHeight;
          console.log(`📐 Canvas2 크기 설정: ${canvas2.width}x${canvas2.height}`);
        }
      };

      setupCanvasSize();

      // 자동 로드 제거 - 사용자가 "선 불러오기" 버튼을 클릭해야 로드됨
    } catch (error) {
      console.error('❌ Canvas 설정 실패:', error);
    }
  };

  setupCanvas();
}, []);

// Window resize 이벤트 처리
useEffect(() => {
  const handleResize = () => {
    // 이미지가 로드된 상태에서만 처리
    const img1 = videoContainerRef1.current?.querySelector('.camera-image');
    const img2 = videoContainerRef2.current?.querySelector('.camera-image');
    
    if (img1?.naturalWidth > 0 && img2?.naturalWidth > 0) {
      // Canvas 크기 재설정
      const canvas1 = canvasRef1.current;
      const canvas2 = canvasRef2.current;
      
      if (img1 && canvas1) {
        canvas1.width = img1.clientWidth;
        canvas1.height = img1.clientHeight;
      }
      
      if (img2 && canvas2) {
        canvas2.width = img2.clientWidth;
        canvas2.height = img2.clientHeight;
      }
      
      // 선 다시 그리기
      redrawCanvas1();
      redrawCanvas2();
      console.log('📐 Resize 후 Canvas 재설정 완료');
    }
  };
  
  // 디바운싱으로 성능 최적화
  let resizeTimer;
  const debouncedResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 300);
  };
  
  window.addEventListener('resize', debouncedResize);
  
  return () => {
    clearTimeout(resizeTimer);
    window.removeEventListener('resize', debouncedResize);
  };
}, [lines1, lines2]);


  // 컴포넌트 마운트 시 WebSocket 연결
  useEffect(() => {
    console.log("🚀 컴포넌트 마운트 - WebSocket 연결 시작")
    connectWebSocket()
    
    // Electron main에서 카메라 서버 준비 완료 이벤트 대기
    console.log("🚀 컴포넌트 마운트 - 카메라 서버 자동 시작 완료 대기 중")
    
    const handleCameraServerReady = () => {
      console.log("✅ 카메라 서버 준비 완료 이벤트 수신")
      setIsCameraServerReady(true)
    }
    
    // Electron API가 있으면 이벤트 리스너 등록
    if (window.electronAPI && window.electronAPI.onCameraServerReady) {
      window.electronAPI.onCameraServerReady(handleCameraServerReady)
    } else {
      // 웹 브라우저 환경이면 즉시 준비 완료로 설정
      console.log("⚠️ Electron API 없음 - 즉시 준비 완료로 설정")
      setIsCameraServerReady(true)
    }
    
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
  }, [])

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
        
        // 줄바꿈으로 구분된 여러 JSON 메시지 처리
        const messages = e.data.trim().split('\n').filter(msg => msg.trim() !== '');
        
        for (const messageStr of messages) {
          try {
            const res = JSON.parse(messageStr.trim());
            processWebSocketMessage(res);
          } catch (parseErr) {
            console.error("❌ 개별 메시지 파싱 오류:", parseErr);
            console.error("❌ 문제가 된 메시지:", messageStr);
          }
        }
      } catch (err) {
        console.error("❌ 모터 메시지 파싱 오류:", err)
        console.error("❌ 문제가 된 원본 데이터:", e.data)
        console.error("❌ 데이터 타입:", typeof e.data)
        console.error("❌ 데이터 길이:", e.data?.length)
      }
    }
    
    // WebSocket 메시지 처리 함수 분리
    const processWebSocketMessage = (res) => {

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
          
          // GPIO 상태는 인터럽트 기반 gpio_state_change 메시지로 처리됨
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
        } else if (res.type === "needle_state_change") {
          // START 버튼 시에만 Status Panel 상태 업데이트 (실시간 업데이트 제거)
          console.log('🎯 니들 상태 변경 (START 버튼 시에만):', res.data)
          
          if (res.data) {
            const { state, needle_tip_connected, gpio11, gpio5 } = res.data
            
            // 니들팁 연결 상태 업데이트 (항상 필요)
            setNeedleTipConnected(needle_tip_connected)
            
            // workStatus 업데이트 (START 버튼 시에만)
            switch (state) {
              case 'disconnected':
                setWorkStatus('disconnected')
                console.log('📍 [P1] 니들팁 없음 상태 (START 버튼)')
                break
              case 'needle_short':
                setWorkStatus('needle_short')
                console.log('🚨 [P2] 니들 쇼트 상태 (START 버튼)')
                break
              case 'connected':
                setWorkStatus('waiting')
                console.log('✅ [P3] 정상 연결 상태 (START 버튼)')
                break
              default:
                console.warn(`알 수 없는 니들 상태: ${state}`)
            }
            
            console.log(`🔍 GPIO 상태: GPIO11=${gpio11 ? 'ON' : 'OFF'}, GPIO5=${gpio5 ? 'HIGH' : 'LOW'}`)
          }
        } else if (res.type === "gpio_state_change") {
          // GPIO 상태 변경 알림 처리 (인터럽트 기반)
          console.log('🔄 GPIO 상태 변경:', res.data)
          
          if (res.data && typeof res.data.pin === 'number' && res.data.state) {
            const { pin, state } = res.data
            
            // 각 GPIO 핀별로 상태 업데이트
            switch (pin) {
              case 5:
                setGpio5State(state)
                prevGpio5Ref.current = state
                console.log(`[GPIO5] Short 체크 상태 변경: ${state} (상태는 needle_state_change에서 통합 관리)`)
                break
              case 6:
                setGpio6State(state)
                console.log(`[GPIO6] START 버튼 상태 변경: ${state}`)
                break
              case 11:
                setGpio11State(state)
                console.log(`[GPIO11] 니들팁 연결 상태 변경: ${state}`)
                break
              case 13:
                setGpio13State(state)
                console.log(`[GPIO13] PASS 버튼 상태 변경: ${state}`)
                break
              case 19:
                setGpio19State(state)
                console.log(`[GPIO19] NG 버튼 상태 변경: ${state}`)
                break
              default:
                console.warn(`[GPIO] 알 수 없는 핀 번호: ${pin}`)
            }
          }
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
  const img1 = document.querySelector('#camera-feed-1 img');
  const img2 = document.querySelector('#camera-feed-2 img');

  const handleImageLoad = (e) => {
    console.log(`🖼️ [이미지 로드] ${e.target.alt} 로드 완료`);
    
    // 이미지 로드 완료 후 캔버스 리사이징 및 선 그리기
    requestAnimationFrame(() => {
      if (e.target.alt === 'Camera 1') {
        resizeCanvas(canvasRef1.current, videoContainerRef1.current, e.target);
        redrawCanvas1();
      } else if (e.target.alt === 'Camera 2') {
        resizeCanvas(canvasRef2.current, videoContainerRef2.current, e.target);
        redrawCanvas2();
      }
    });
  };

  const handleWindowResize = () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
      console.log(`⏱️ [윈도우 리사이즈] 디바운스 후 resizeAll 실행`);
      resizeAll();
      
      // 리사이즈 후 명시적으로 다시 그리기
      requestAnimationFrame(() => {
        redrawCanvas1();
        redrawCanvas2();
      });
    }, 100);
  };

  window.addEventListener('resize', handleWindowResize);
  
  if (img1) {
    img1.addEventListener('load', handleImageLoad);
    if (img1.complete && img1.naturalWidth > 0) {
      console.log(`✅ [초기화] Camera 1 이미지 이미 로드됨`);
      resizeCanvas(canvasRef1.current, videoContainerRef1.current, img1);
      requestAnimationFrame(() => redrawCanvas1());
    }
  }
  
  if (img2) {
    img2.addEventListener('load', handleImageLoad);
    if (img2.complete && img2.naturalWidth > 0) {
      console.log(`✅ [초기화] Camera 2 이미지 이미 로드됨`);
      resizeCanvas(canvasRef2.current, videoContainerRef2.current, img2);
      requestAnimationFrame(() => redrawCanvas2());
    }
  }

  // 초기 실행
  setTimeout(() => {
    console.log(`⏱️ [초기화] 초기 resizeAll 및 redraw 실행`);
    resizeAll();
    requestAnimationFrame(() => {
      redrawCanvas1();
      redrawCanvas2();
    });
  }, 200);

  return () => {
    window.removeEventListener('resize', handleWindowResize);
    if (img1) img1.removeEventListener('load', handleImageLoad);
    if (img2) img2.removeEventListener('load', handleImageLoad);
    clearTimeout(window.resizeTimer);
  };
}, [videoServerUrl, lines1, lines2]); // lines1, lines2 의존성 추가


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
            videoServerUrl={isCameraServerReady ? videoServerUrl : null}
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
            onManualSave={handleManualSave1} // 수동 저장 핸들러
            onManualLoad={handleManualLoad1} // 수동 로드 핸들러
            workStatus={workStatus} // 작업 상태 전달
            ref={cameraViewRef1} // CameraView ref 추가
          />
          <CameraView
            title="Camera 2"
            cameraId={2}
            videoServerUrl={isCameraServerReady ? videoServerUrl : null}
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
            onManualSave={handleManualSave2} // 수동 저장 핸들러
            onManualLoad={handleManualLoad2} // 수동 로드 핸들러
            workStatus={workStatus} // 작업 상태 전달
            ref={cameraViewRef2} // CameraView ref 추가
          />
        </div>

        {/* Bottom Control Panels */}
        <div className="flex gap-4" style={{ height: '35dvh' }}>
          <div className="w-[20%]">
            <StatusPanel mode={mode} workStatus={workStatus} needleTipConnected={needleTipConnected} isWaitingEepromRead={isWaitingEepromRead} />
          </div>
          <div className="w-[30%]">
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
            onDataSettingsChange={setDataSettings} // 데이터 설정 변경 콜백 추가
            needleOffset1={needleOffset1} // 모터 1 니들 오프셋 전달
            needleProtrusion1={needleProtrusion1} // 모터 1 니들 돌출부분 전달
            needleSpeed1={needleSpeed1} // 모터 1 니들 속도 전달
            needleOffset2={needleOffset2} // 모터 2 니들 오프셋 전달
            needleProtrusion2={needleProtrusion2} // 모터 2 니들 돌출부분 전달
            needleSpeed2={needleSpeed2} // 모터 2 니들 속도 전달
            isDecelerationEnabled={isDecelerationEnabled} // 감속 활성화 여부 전달
            decelerationPosition={decelerationPosition} // 감속 위치 전달
            decelerationSpeed={decelerationSpeed} // 감속 스피드 전달
            resistanceThreshold={resistanceThreshold} // 저항 임계값 전달
            onResistanceAbnormalChange={setIsResistanceAbnormal} // 저항 이상 상태 변경 함수 전달
            isNeedleShortFixed={isNeedleShortFixed} // START 시점 니들 쇼트 고정 상태 전달
            onNeedleShortFixedChange={setIsNeedleShortFixed} // START 시점 니들 쇼트 고정 상태 변경 함수 전달
            onResistance1Change={setResistance1} // 저항1 값 변경 함수 전달
            onResistance2Change={setResistance2} // 저항2 값 변경 함수 전달
            onResistance1StatusChange={setResistance1Status} // 저항1 상태 변경 함수 전달
            onResistance2StatusChange={setResistance2Status} // 저항2 상태 변경 함수 전달
            gpio5State={gpio5State} // GPIO 5번 쇼트 체크 상태 전달
            motor2Position={motor2Position} // 실시간 모터2 위치 전달
            motor1Position={currentPosition} // 실시간 모터1 위치 전달
          />
          </div>
          <div className="w-[27.5%]">
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
              needleSpeed1={needleSpeed1}
              onNeedleSpeed1Change={setNeedleSpeed1}
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
              needleSpeed={needleSpeed1}
              onNeedleSpeedChange={setNeedleSpeed1}
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
            hasNeedleTip={needleTipConnected} // GPIO23 기반 니들팸 연결 상태 전달
            websocket={ws} // WebSocket 연결 전달
            isWsConnected={isWsConnected} // WebSocket 연결 상태 전달
            onCaptureMergedImage={captureMergedImage} // 병합 캐처 함수 전달
            eepromData={readEepromData} // EEPROM 데이터 전달
            generateUserBasedPath={generateUserBasedPath} // 사용자 기반 폴더 경로 생성 함수 전달
            isWaitingEepromRead={isWaitingEepromRead} // EEPROM 읽기 대기 상태 전달
            onWaitingEepromReadChange={setIsWaitingEepromRead} // EEPROM 읽기 대기 상태 변경 함수 전달
            isResistanceAbnormal={isResistanceAbnormal} // 저항 이상 상태 전달
            isNeedleShortFixed={isNeedleShortFixed} // START 시점 니들 쇼트 고정 상태 전달
            needleOffset1={needleOffset1} // 모터 1 초기 위치 전달
            needleOffset2={needleOffset2} // 모터 2 초기 위치 전달
            needleSpeed1={needleSpeed1} // 모터 1 속도 전달
            needleSpeed2={needleSpeed2} // 모터 2 속도 전달
            workStatus={workStatus} // 작업 상태 전달 (니들 쇼트 포함)
            onDebugModeChange={setIsDebugMode} // 디버깅 모드 변경 콜백 전달
            dataSettings={dataSettings} // 데이터 설정 전달
            onWorkStatusChange={setWorkStatus} // 작업 상태 변경 콜백 전달 (EEPROM 실패 시 사용)
            />
          </div>
        </div>
      </main>
    </div>
  )
}
