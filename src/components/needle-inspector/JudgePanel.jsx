import Panel from "./Panel"
import { Button } from "./Button"
import { useAuth } from "../../hooks/useAuth.jsx"
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react"
import { getId } from '../../utils/csvCache'

const JudgePanel = forwardRef(function JudgePanel({ onJudge, isStarted, onReset, camera1Ref, camera2Ref, hasNeedleTip = true, websocket, isWsConnected, onCaptureMergedImage, eepromData, generateUserBasedPath, isWaitingEepromRead = false, onWaitingEepromReadChange, isResistanceAbnormal = false, isNeedleShortFixed = false, needleOffset1, needleOffset2, needleSpeed1, needleSpeed2, workStatus = 'waiting', onDebugModeChange, dataSettings }, ref) {
  // 사용자 정보 가져오기
  const { user, resetUsersCache } = useAuth()
  
  // 일일 시리얼 번호 관리
  const [dailySerialNumber, setDailySerialNumber] = useState(1)
  
  // 일일 시리얼 번호 초기화 및 관리
  useEffect(() => {
    // 프로그램 시작 시 또는 날짜 변경 시 시리얼 번호 초기화
    const loadDailySerial = async () => {
      const today = new Date().toISOString().split('T')[0]
      const storageKey = `dailySerial_${today}`
      
      try {
        // electron-store에서 오늘 날짜의 시리얼 번호 로드
        const savedSerial = await window.electronAPI.getStoredValue(storageKey)
        if (savedSerial) {
          setDailySerialNumber(savedSerial)
        } else {
          // 오늘 날짜의 첫 번째 시리얼
          setDailySerialNumber(1)
          await window.electronAPI.setStoredValue(storageKey, 1)
        }
      } catch (error) {
        console.error('일일 시리얼 번호 로드 실패:', error)
        setDailySerialNumber(1)
      }
    }
    
    loadDailySerial()
  }, [])
  
  // 일일 시리얼 번호 증가 함수
  const incrementDailySerial = async () => {
    const newSerial = dailySerialNumber + 1
    setDailySerialNumber(newSerial)
    
    const today = new Date().toISOString().split('T')[0]
    const storageKey = `dailySerial_${today}`
    
    try {
      await window.electronAPI.setStoredValue(storageKey, newSerial)
    } catch (error) {
      console.error('일일 시리얼 번호 저장 실패:', error)
    }
    
    return dailySerialNumber // 현재 번호 반환 (증가 전)
  }
  
  // 관리자 패널 상태
  const [isAdminMode, setIsAdminMode] = useState(false)
  const [isDebugMode, setIsDebugMode] = useState(false) // 디버깅 모드 상태 추가
  const [adminPaths, setAdminPaths] = useState({
    users: '',
    mtr2: '',
    mtr4: '',
    savePath: ''
  })
  
  // 3초 타이머 관련
  const pressTimerRef = useRef(null)
  const [isPressing, setIsPressing] = useState(false)
  
  // 관리자 모드가 활성화될 때 현재 설정 로드
  useEffect(() => {
    if (isAdminMode) {
      const loadAdminSettings = async () => {
        try {
          // 이미지 저장 경로 로드
          const imagePathResult = await window.electronAPI.getImageSavePath();
          if (imagePathResult && imagePathResult.success && imagePathResult.data) {
            setAdminPaths(prev => ({
              ...prev,
              savePath: imagePathResult.data
            }));
          }
          
          // 관리자 설정 로드 (MTR2, MTR4 파일 경로)
          const adminResult = await window.electronAPI.getAdminSettings();
          if (adminResult && adminResult.success && adminResult.data) {
            setAdminPaths(prev => ({
              ...prev,
              ...adminResult.data
            }));
            console.log('관리자 설정 로드 완료:', adminResult.data);
          }
        } catch (error) {
          console.error('관리자 설정 로드 실패:', error);
        }
      };
      loadAdminSettings();
    }
  }, [isAdminMode]);
  
  // 니듡 DOWN 명령 전송 함수 (메인 WebSocket 사용) - 모터 1, 2 모두 초기 위치로
  const sendNeedleDown = () => {
    if (websocket && isWsConnected) {
      const motor1DownPosition = Math.round((needleOffset1 || 0.1) * 125);
      const motor2DownPosition = Math.round((needleOffset2 || 0.1) * 40); // 모터2는 40배율 사용
      
      console.log('판정 후 모터 1 DOWN 명령 전송 - 위치:', motor1DownPosition, '(초기 위치:', needleOffset1 || 0.1, '), 속도:', needleSpeed1 || 1000)
      websocket.send(JSON.stringify({ 
        cmd: "move", 
        position: motor1DownPosition, 
        mode: "speed", 
        motor_id: 1,
        needle_speed: needleSpeed1 || 1000
      }))
      
      console.log('판정 후 모터 2 DOWN 명령 전송 - 위치:', motor2DownPosition, '(초기 위치:', needleOffset2 || 0.1, '), 속도:', needleSpeed2 || 5000)
      websocket.send(JSON.stringify({ 
        cmd: "move", 
        position: motor2DownPosition, 
        mode: "speed", 
        motor_id: 2,
        needle_speed: needleSpeed2 || 5000
      }))
    } else {
      console.error('WebSocket 연결되지 않음 - 니듡 DOWN 명령 실패')
    }
  }



  // 병합된 스크린샷을 저장하는 함수
  const saveMergedScreenshot = async (judgeResult, eepromData) => {
    if (!onCaptureMergedImage) {
      console.error('병합 캡처 함수가 없습니다.');
      return;
    }

    try {
      // 병합된 이미지 데이터 생성
      const mergedImageData = await onCaptureMergedImage(judgeResult, eepromData);
      
      if (!mergedImageData) {
        console.error('❌ 병합 이미지 생성 실패');
        return;
      }

      // 기존 동기 흐름을 유지하는 레거시 경로: 캡처 후 저장까지 완료
      await saveMergedScreenshotFromData(mergedImageData, judgeResult, eepromData);
      
    } catch (error) {
      console.error('❌ 병합 이미지 저장 실패:', error);
    }
  };

  // '이미 캡처된' 병합 이미지 데이터(URL)를 받아 파일로 저장하는 함수
  const saveMergedScreenshotFromData = async (mergedImageData, judgeResult, eepromData) => {
    try {
      // EEPROM 데이터에서 정보 추출 (읽은 데이터 우선 사용)
      let inspectorCode = 'A';
      let manufacturingDate = '';
      let dailySerial = '';
      let judgment = judgeResult || 'UNKNOWN';
      let tipType = 'T000';
      let workerBirthday = '0000';
      let workerName = 'unknown';
      
      if (eepromData && eepromData.success) {
        // EEPROM에서 읽은 데이터 사용
        inspectorCode = eepromData.inspectorCode || 'A';
        manufacturingDate = `${String(eepromData.year || 2025).slice(-2)}${String(eepromData.month || 1).padStart(2, '0')}${String(eepromData.day || 1).padStart(2, '0')}`;
        dailySerial = String(eepromData.dailySerial || dailySerialNumber).padStart(4, '0');
        judgment = eepromData.judgeResult || judgeResult || 'UNKNOWN';
        
        // 팁타입을 T로 시작하고 3자리 제로패딩 (예: T030)
        const rawTipType = eepromData.tipType || 0;
        tipType = `T${String(rawTipType).padStart(3, '0')}`;
        
        // 작업자 정보 (user 정보 우선)
        if (user) {
          workerBirthday = user.birthLast4 || '0000'; // 작업자 생일 끝 4자리 (MMDD 형식)
          workerName = user.name || 'unknown';
        }
      } else {
        // EEPROM 데이터가 없으면 기본값 사용
        inspectorCode = dataSettings?.inspector || 'A';
        const today = new Date();
        manufacturingDate = `${String(today.getFullYear()).slice(-2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        dailySerial = String(dailySerialNumber).padStart(4, '0');
        
        if (user) {
          workerBirthday = user.birthLast4 || '0000';
          workerName = user.name || 'unknown';
        }
      }
      
      // 파일명 생성: [검사기코드]-[제조일]-[일일순번]-[판정]-[팁타입]-[작업자생일]-[작업자명].png
      // 예시: A-251103-0001-PASS-T030-0607-홍길동.png
      const fileName = `${inspectorCode}-${manufacturingDate}-${dailySerial}-${judgment}-${tipType}-${workerBirthday}-${workerName}.png`;

      // 사용자 정보 기반 폴더 경로 생성
      const baseDir = generateUserBasedPath ? await generateUserBasedPath(judgeResult) : 
                     (judgeResult === 'NG' ? 'C:\\Inspect\\NG' : 'C:\\Inspect\\PASS');
      
      // 폴더가 없으면 생성 (Electron API 사용)
      await window.electronAPI.ensureDir(baseDir);
      
      const savePath = `${baseDir}\\${fileName}`;
      
      // Electron API를 통해 파일 저장
      const result = await window.electronAPI.saveFile(savePath, mergedImageData);
      
      if (result.success) {
        console.log(`✅ 병합 이미지 저장 완료: ${savePath}`);
      } else {
        throw new Error(result.error);
      }
      
    } catch (error) {
      console.error('❌ 병합 이미지 저장 실패:', error);
    }
  };

  // EEPROM 쓰기 함수 (판정 시 호출)
  const writeEepromWithJudgment = async (judgeResult) => {
    return new Promise((resolve, reject) => {
      console.log('🔍 writeEepromWithJudgment 디버깅:');
      console.log('  - websocket:', !!websocket);
      console.log('  - isWsConnected:', isWsConnected);
      console.log('  - dataSettings:', dataSettings);
      
      if (!websocket || !isWsConnected || !dataSettings) {
        const errorMsg = `WebSocket 또는 데이터 설정 없음 - websocket: ${!!websocket}, connected: ${isWsConnected}, dataSettings: ${!!dataSettings}`;
        console.error('❌', errorMsg);
        reject(new Error(errorMsg));
        return;
      }

      // 현재 일일 시리얼 번호 사용
      const currentSerial = dailySerialNumber;
      
      const eepromWriteData = {
        cmd: "eeprom_write",
        tipType: calculateTipType(), // DataSettingsPanel과 동일한 로직 필요
        shotCount: 0,
        year: parseInt(dataSettings.selectedYear),
        month: parseInt(dataSettings.selectedMonth),
        day: parseInt(dataSettings.selectedDay),
        makerCode: parseInt(dataSettings.manufacturer) || 4,
        mtrVersion: dataSettings.mtrVersion,
        country: dataSettings.selectedCountry,
        inspectorCode: dataSettings.inspector || 'A',
        judgeResult: judgeResult,
        dailySerial: currentSerial
      };

      console.log('📝 EEPROM 쓰기 (판정 데이터 포함):', eepromWriteData);

      const handleResponse = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.type === 'eeprom_write') {
            websocket.removeEventListener('message', handleResponse);
            
            if (response.result && response.result.success) {
              console.log('✅ EEPROM 쓰기 성공 (판정 데이터 포함)');
              console.log('🔍 백엔드 응답 상세:', response.result);
              console.log('🔍 response.result.data:', response.result.data);
              // 쓰기 후 읽은 데이터도 함께 반환
              resolve(response.result.data || response.result);
            } else {
              console.error('❌ EEPROM 쓰기 실패:', response.result);
              reject(new Error(response.result?.error || 'EEPROM 쓰기 실패'));
            }
          }
        } catch (err) {
          console.error('EEPROM 응답 파싱 오류:', err);
        }
      };

      websocket.addEventListener('message', handleResponse);
      websocket.send(JSON.stringify(eepromWriteData));

      // 타임아웃
      setTimeout(() => {
        websocket.removeEventListener('message', handleResponse);
        reject(new Error('EEPROM 쓰기 타임아웃'));
      }, 5000);
    });
  };

  // TIP TYPE 계산 (DataSettingsPanel과 동일한 로직)
  const calculateTipType = () => {
    console.log('🔍 calculateTipType 디버깅:');
    console.log('  - dataSettings:', dataSettings);
    
    if (!dataSettings) {
      console.log('  - dataSettings가 null/undefined');
      return null;
    }
    
    const { mtrVersion, selectedCountry, selectedNeedleType } = dataSettings;
    console.log('  - mtrVersion:', mtrVersion);
    console.log('  - selectedCountry:', selectedCountry);
    console.log('  - selectedNeedleType:', selectedNeedleType);
    
    if (!mtrVersion || !selectedCountry || !selectedNeedleType) {
      console.log('  - 필수 데이터 누락');
      return null;
    }
    
    // CSV 캐시에서 ID 조회
    const id = getId(mtrVersion, selectedCountry, selectedNeedleType);
    console.log('  - CSV에서 조회한 ID:', id);
    
    // ID가 숫자 형태라면 그대로 반환, 아니면 null
    const numericId = parseInt(id);
    const result = isNaN(numericId) ? null : numericId;
    console.log('  - 최종 tipType:', result);
    return result;
  };

  // 판정 로직을 처리하는 중앙 함수
  const handleJudge = async (result) => {
    try {
      // 1. EEPROM에 판정 결과와 함께 쓰기/읽기 (LED 제어 전에 수행)
      let updatedEepromData = null;
      try {
        console.log('📝 EEPROM 쓰기 시작 (판정 결과 포함)...');
        updatedEepromData = await writeEepromWithJudgment(result);
        console.log('✅ EEPROM 쓰기/읽기 완료:', updatedEepromData);
        
        // 일일 시리얼 번호 증가 (다음 판정을 위해)
        await incrementDailySerial();
      } catch (error) {
        console.error('❌ EEPROM 처리 실패:', error);
        // EEPROM 실패해도 계속 진행 (기존 데이터 사용)
        updatedEepromData = eepromData;
      }

      // 2. EEPROM 처리 완료 후 LED 제어 명령 전송
      if (websocket && isWsConnected) {
        const ledCommand = {
          cmd: "led_control",
          type: result === 'PASS' ? "green" : "red"
        };
        console.log(`🔴🟢 EEPROM 처리 완료 후 ${result} LED 제어:`, ledCommand);
        websocket.send(JSON.stringify(ledCommand));
      }

      // 3. 캡처 먼저 수행하여 '화면 그대로' 확보
      const mergedImageData = await onCaptureMergedImage(result, updatedEepromData || eepromData);

      // 4. 캡처가 확보되면 즉시 니들 DOWN (작업 대기 시간 최소화)
      sendNeedleDown();

      // 5. 디스크 저장은 비동기로 진행하여 UI/동작 지연 최소화
      //    EEPROM에서 읽은 데이터를 사용하여 파일명 생성
      saveMergedScreenshotFromData(mergedImageData, result, updatedEepromData || eepromData).catch(err => {
        console.error('❌ 비동기 병합 이미지 저장 실패:', err);
      });
      

      if (onReset) onReset()
      if (onWaitingEepromReadChange) onWaitingEepromReadChange(false) // EEPROM 읽기 대기 상태 초기화
      
      
      // 콜백 호출
      if (onJudge) onJudge(result)

    } catch (error) {
      console.error(`❌ ${result} 판정 처리 중 에러 발생:`, error);
    }
  };

  const handleNGClick = () => {
    // 화면 버튼의 disabled 로직과 동일한 검사 - 오류 상황에서는 NG 버튼도 비활성화
    const isDisabled = !isStarted || !hasNeedleTip || isWaitingEepromRead || 
                      isResistanceAbnormal || isNeedleShortFixed || workStatus === 'needle_short' || 
                      workStatus === 'write_failed' || workStatus === 'read_failed';
    
    if (isDisabled) {
      console.log("🔘 [PHYSICAL] NG 버튼 무시 (UI 비활성화 상태 또는 오류 상황)");
      return; // UI가 비활성화된 상태이므로 물리 버튼 입력 무시
    }
    
    console.log("NG 판정");
    handleJudge('NG');
  };

  const handlePassClick = () => {
    // 화면 버튼의 disabled 로직과 동일한 검사
    const isDisabled = !isStarted || !hasNeedleTip || isWaitingEepromRead || isResistanceAbnormal || isNeedleShortFixed || workStatus === 'needle_short';
    
    if (isDisabled) {
      console.log("🔘 [PHYSICAL] PASS 버튼 무시 (UI 비활성화 상태)");
      return; // UI가 비활성화된 상태이므로 물리 버튼 입력 무시
    }
    
    console.log("PASS 판정");
    handleJudge('PASS');
  };

  // 외부에서 접근 가능한 함수들을 노출
  useImperativeHandle(ref, () => ({
    handlePASSClick: handlePassClick,
    handleNGClick: handleNGClick
  }));

  // 3초간 누르기 핸들러
  const handleMouseDown = (mode) => {
    setIsPressing(true)
    pressTimerRef.current = setTimeout(() => {
      if (mode === 'admin') {
        setIsAdminMode(true)
      } else if (mode === 'judge') {
        setIsAdminMode(false)
      }
      setIsPressing(false)
    }, 3000)
  }

  const handleMouseUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    setIsPressing(false)
  }

  const handleMouseLeave = () => {
    handleMouseUp()
  }

  // 파일/폴더 선택 핸들러
  const handleFileSelect = async (type) => {
    try {
      let result
      if (type === 'savePath') {
        // 폴더 선택
        result = await window.electronAPI.selectFolder()
      } else {
        // 파일 선택
        result = await window.electronAPI.selectFile()
      }
      
      if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
        setAdminPaths(prev => ({
          ...prev,
          [type]: result.filePaths[0]
        }))
      }
    } catch (error) {
      console.error('파일/폴더 선택 실패:', error)
    }
  }

  // 관리자 패널 렌더링
  const renderAdminPanel = () => {
    const adminItems = [
      { key: 'users', label: '작업자 데이터 파일', isFile: true },
      { key: 'mtr2', label: 'mtr2 eprom 파일', isFile: true },
      { key: 'mtr4', label: 'mtr4 eprom 파일', isFile: true },
      { key: 'savePath', label: '결과 이미지 저장 경로', isFile: false }
    ]

    return (
      <Panel 
        title={<h2 className="text-lg font-bold text-responsive">관리자 패널</h2>}
        onMouseDown={() => handleMouseDown('judge')}
        onMouseUp={handleMouseUp}
      >
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

          {/* 각 파일/경로 설정 행 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {adminItems.map(item => (
              <div key={item.key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1dvw',
                padding: '0.8dvh',
                borderRadius: '0.375rem'
              }}>
                {/* 라벨 */}
                <div style={{
                  minWidth: '7dvw',
                  fontSize: '1.2dvh',
                  fontWeight: '500',
                  color: '#D1D5DB'
                }}>
                  {item.label}
                </div>
                
                {/* 경로 표시 */}
                <div style={{
                  flex: 1,
                  padding: '0.4dvh 0.8dvw',
                  border: '1px solid #4A5568',
                  borderRadius: '0.25rem',
                  fontSize: '1.1dvh',
                  color: '#A0AEC0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  backgroundColor: '#1F2937'
                }}>
                  {adminPaths[item.key] || '파일을 선택하세요'}
                </div>
                
                {/* 찾기 버튼 */}
                <Button
                  onClick={() => handleFileSelect(item.key)}
                  style={{
                    minWidth: '2.5dvw',
                    height: '2.5dvh',
                    fontSize: '1.1dvh',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
                  }}
                >
                  찾기
                </Button>
              </div>
            ))}
          </div>


          {/* 적용하기 버튼 */}
          <div style={{
          }}>
            <Button
              onClick={async () => {
                try {
                  let hasChanges = false;
                  
                  // 1. 결과 이미지 저장 경로 설정
                  if (adminPaths.savePath) {
                    await window.electronAPI.saveImageSavePath(adminPaths.savePath);
                    console.log('결과 이미지 저장 경로 설정 완료:', adminPaths.savePath);
                    hasChanges = true;
                  }
                  
                  // 2. 작업자 데이터 파일(users) 설정 및 캐시 업데이트
                  if (adminPaths.users) {
                    console.log('작업자 데이터 파일 업데이트 시작:', adminPaths.users);
                    
                    // 사용자 캐시 강제 리셋 (새로운 users 파일 반영)
                    const resetSuccess = await resetUsersCache();
                    if (resetSuccess) {
                      console.log('✅ 작업자 데이터 파일 업데이트 완료');
                    } else {
                      console.error('❌ 작업자 데이터 파일 업데이트 실패');
                    }
                    hasChanges = true;
                  }
                  
                  // 3. MTR2, MTR4 CSV 파일 설정 및 캐시 업데이트
                  if (adminPaths.mtr2 || adminPaths.mtr4) {
                    const csvData = { '2.0': [], '4.0': [] };
                    
                    // MTR2 파일 로드
                    if (adminPaths.mtr2) {
                      const mtr2Result = await window.electronAPI.loadCsvFile(adminPaths.mtr2);
                      if (mtr2Result.success) {
                        csvData['2.0'] = mtr2Result.data;
                        console.log('MTR2 파일 로드 완료:', adminPaths.mtr2);
                      } else {
                        console.error('MTR2 파일 로드 실패:', mtr2Result.error);
                      }
                    }
                    
                    // MTR4 파일 로드
                    if (adminPaths.mtr4) {
                      const mtr4Result = await window.electronAPI.loadCsvFile(adminPaths.mtr4);
                      if (mtr4Result.success) {
                        csvData['4.0'] = mtr4Result.data;
                        console.log('MTR4 파일 로드 완료:', adminPaths.mtr4);
                      } else {
                        console.error('MTR4 파일 로드 실패:', mtr4Result.error);
                      }
                    }
                    
                    // CSV 캐시 강제 업데이트
                    const { resetAndInitializeCache } = await import('../../utils/csvCache.js');
                    resetAndInitializeCache(csvData);
                    hasChanges = true;
                  }
                  
                  // 4. 관리자 설정 저장 (모든 변경사항)
                  if (hasChanges) {
                    await window.electronAPI.saveAdminSettings(adminPaths);
                    console.log('관리자 설정 저장 완료:', adminPaths);
                  }
                  
                  if (hasChanges) {
                    alert('설정이 적용되었습니다.');
                    // 페이지 새로고침으로 변경사항 반영
                    window.location.reload();
                  } else {
                    alert('적용할 설정이 없습니다.');
                  }
                } catch (error) {
                  console.error('설정 적용 오류:', error);
                  alert('설정 적용 중 오류가 발생했습니다.');
                }
              }}
              style={{
                width: '100%',
                height: '4dvh',
                fontSize: '1.3dvh',
                fontWeight: 'bold',
                backgroundColor: '#059669',
                color: 'white',
                border: '1px solid #059669',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              적용하기
            </Button>
          </div>

          {/* 디버깅 모드 버튼 */}
          <div style={{ 
            marginTop: 'auto',
            paddingTop: '1dvh',
            borderTop: '1px solid #374151'
          }}>
            <Button
              onClick={() => {
                const newDebugMode = !isDebugMode;
                setIsDebugMode(newDebugMode);
                // 부모 컴포넌트에 디버깅 모드 변경 알림
                if (onDebugModeChange) {
                  onDebugModeChange(newDebugMode);
                }
              }}
              style={{
                width: '100%',
                height: '4dvh',
                fontSize: '1.3dvh',
                fontWeight: 'bold',
                backgroundColor: isDebugMode ? '#DC2626' : '#374151',
                color: 'white',
                border: isDebugMode ? '1px solid #DC2626' : '1px solid #6B7280',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {isDebugMode ? '디버깅 모드 ON' : '디버깅 모드 OFF'}
            </Button>
          </div>
        </div>
      </Panel>
    )
  }

  // 관리자 모드인지에 따라 다른 패널 렌더링
  if (isAdminMode) {
    return renderAdminPanel()
  }

  return (
    <Panel 
      title={<h2 className="text-lg font-bold text-responsive">판정</h2>}
      onMouseDown={() => handleMouseDown('admin')}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      <div style={{ display: 'flex', gap: '1dvw', height: '100%' }}>
        

        
        {/* PASS 버튼 */}
        <Button
          onClick={handlePassClick}
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead || isResistanceAbnormal || isNeedleShortFixed || workStatus === 'needle_short'}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short') ? '#0CB56C' : '#6B7280',
            color: 'white',
            fontSize: '1.8dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short') ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '29.5dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short') ? 1 : 0.6
          }}
        >
          PASS
        </Button>

                {/* NG 버튼 */}
        <Button
          onClick={handleNGClick}
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead || isResistanceAbnormal || isNeedleShortFixed || workStatus === 'needle_short' || workStatus === 'write_failed' || workStatus === 'read_failed'}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short' && workStatus !== 'write_failed' && workStatus !== 'read_failed') ? '#C22727' : '#6B7280',
            color: 'white',
            fontSize: '1.8dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short' && workStatus !== 'write_failed' && workStatus !== 'read_failed') ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '29.5dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && !isNeedleShortFixed && workStatus !== 'needle_short' && workStatus !== 'write_failed' && workStatus !== 'read_failed') ? 1 : 0.6
          }}
        >
          NG
        </Button>
      </div>
    </Panel>
  )
})

export default JudgePanel
