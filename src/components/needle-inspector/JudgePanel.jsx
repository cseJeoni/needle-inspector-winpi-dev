import Panel from "./Panel"
import { Button } from "./Button"
import { useAuth } from "../../hooks/useAuth.jsx"
import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react"

const JudgePanel = forwardRef(function JudgePanel({ onJudge, isStarted, onReset, camera1Ref, camera2Ref, hasNeedleTip = true, websocket, isWsConnected, onCaptureMergedImage, eepromData, generateUserBasedPath, isWaitingEepromRead = false, onWaitingEepromReadChange, isResistanceAbnormal = false, needleOffset1, needleOffset2, needleSpeed1, needleSpeed2, workStatus = 'waiting', onDebugModeChange }, ref) {
  // 사용자 정보 가져오기
  const { user, resetUsersCache } = useAuth()
  
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
      // 파일명 생성: 캡쳐날짜_캡쳐시각_팁타입_제조일자_작업자코드_작업자이름 (로컬 시간 기준)
      const date = new Date();
      const captureDate = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const captureTime = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
      
      // EEPROM 데이터에서 팁타입과 제조일자 추출
      let tipType = 'T000';
      let mfgDate = '000000';
      
      if (eepromData && eepromData.tipType) {
        tipType = `T${String(eepromData.tipType).padStart(3, '0')}`;
      }
      
      if (eepromData && eepromData.year && eepromData.month && eepromData.day) {
        mfgDate = `${String(eepromData.year).slice(-2)}${String(eepromData.month).padStart(2, '0')}${String(eepromData.day).padStart(2, '0')}`;
      }
      
      // 사용자 정보 추출 (CSV 기반 로그인 시스템)
      let workerCode = 'unkn';
      let workerName = 'unknown';
      
      // 직접 사용자 정보 사용
      console.log('🔍 JudgePanel 사용자 정보 디버깅:', {
        user: user,
        userType: typeof user,
        hasBirthLast4: user?.birthLast4,
        hasId: user?.id,
        userKeys: user ? Object.keys(user) : 'null'
      });
      
      if (user && user.birthLast4 && user.id) {
        workerCode = user.birthLast4; // birth 끝 4자리
        workerName = user.id;         // CSV의 id 값
        console.log(`👤 JudgePanel 사용자 정보 - 코드: ${workerCode}, 이름: ${workerName}`);
      } else {
        console.warn('⚠️ JudgePanel에서 사용자 정보를 찾을 수 없습니다.');
      }
      
      const fileName = `${captureDate}_${captureTime}_${tipType}_${mfgDate}_${workerCode}_${workerName}.png`;

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

  // 판정 로직을 처리하는 중앙 함수
  const handleJudge = async (result) => {
    try {
      // 1. EEPROM 데이터 사용 (props로 받은 데이터)
      console.log('📡 EEPROM 데이터 사용:', eepromData);
      console.log('📡 현재 작업 상태:', workStatus);

      // 2. 캡처 먼저 수행하여 '화면 그대로' 확보
      const mergedImageData = await onCaptureMergedImage(result, eepromData);

      // 3. 캡처가 확보되면 즉시 니들 DOWN (작업 대기 시간 최소화)
      sendNeedleDown();

      // 4. 디스크 저장은 비동기로 진행하여 UI/동작 지연 최소화
      //    실패 시 로그만 남김 (필요하다면 재시도 로직 추가 가능)
      saveMergedScreenshotFromData(mergedImageData, result, eepromData).catch(err => {
        console.error('❌ 비동기 병합 이미지 저장 실패:', err);
      });
      
      // 상태 초기화
      if (onReset) onReset()
      if (onWaitingEepromReadChange) onWaitingEepromReadChange(false) // EEPROM 읽기 대기 상태 초기화
      
      // 콜백 호출
      if (onJudge) onJudge(result)

    } catch (error) {
      console.error(`❌ ${result} 판정 처리 중 에러 발생:`, error);
    }
  };

  const handleNGClick = () => {
    console.log("NG 판정");
    handleJudge('NG');
  };

  const handlePassClick = () => {
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
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead || isResistanceAbnormal || workStatus === 'needle_short'}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && workStatus !== 'needle_short') ? '#0CB56C' : '#6B7280',
            color: 'white',
            fontSize: '1.8dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && workStatus !== 'needle_short') ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '29.5dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead && !isResistanceAbnormal && workStatus !== 'needle_short') ? 1 : 0.6
          }}
        >
          PASS
        </Button>

                {/* NG 버튼 */}
        <Button
          onClick={handleNGClick}
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? '#C22727' : '#6B7280',
            color: 'white',
            fontSize: '1.8dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '29.5dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 1 : 0.6
          }}
        >
          NG
        </Button>
      </div>
    </Panel>
  )
});

export default JudgePanel;
