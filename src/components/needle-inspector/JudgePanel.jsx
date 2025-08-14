import Panel from "./Panel"
import { Button } from "./Button"
import { useAuth } from "../../hooks/useAuth.jsx"

export default function JudgePanel({ onJudge, isStarted, onReset, camera1Ref, camera2Ref, hasNeedleTip = true, websocket, isWsConnected, onCaptureMergedImage, eepromData, generateUserBasedPath, isWaitingEepromRead = false, onWaitingEepromReadChange }) {
  // 사용자 정보 가져오기
  const { user } = useAuth()
  
  // 니들 DOWN 명령 전송 함수 (메인 WebSocket 사용)
  const sendNeedleDown = () => {
    if (websocket && isWsConnected) {
      console.log('판정 후 니들 DOWN 명령 전송')
      websocket.send(JSON.stringify({ cmd: "move", position: 0, mode: "position" }))
    } else {
      console.error('WebSocket 연결되지 않음 - 니들 DOWN 명령 실패')
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
      // 파일명 생성: 캡쳐날짜_캡쳐시각_팁타입_제조일자_작업자코드_작업자이름
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
      const baseDir = generateUserBasedPath ? generateUserBasedPath(judgeResult) : 
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

  return (
    <Panel title="판정">
      <div style={{ display: 'flex', gap: '1dvw', height: '100%' }}>
        {/* NG 버튼 */}
        <Button
          onClick={handleNGClick}
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? '#C22727' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 1 : 0.6
          }}
        >
          NG
        </Button>
        
        {/* PASS 버튼 */}
        <Button
          onClick={handlePassClick}
          disabled={!isStarted || !hasNeedleTip || isWaitingEepromRead}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? '#0CB56C' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: (isStarted && hasNeedleTip && !isWaitingEepromRead) ? 1 : 0.6
          }}
        >
          PASS
        </Button>
      </div>
    </Panel>
  )
}
