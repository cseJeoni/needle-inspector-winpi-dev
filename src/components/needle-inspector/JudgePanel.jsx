import Panel from "./Panel"
import { Button } from "./Button"

export default function JudgePanel({ onJudge, isStarted, onReset, camera1Ref, camera2Ref, hasNeedleTip = true, websocket, isWsConnected, onCaptureMergedImage, eepromData }) {
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

      // 파일명 생성
      const date = new Date();
      const formattedDate = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
      const fileName = `${formattedDate}_${formattedTime}_Merged_${judgeResult}.png`;

      // 이미지 데이터를 Buffer로 변환
      const blob = await (await fetch(mergedImageData)).blob();
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 저장 경로 설정
      const fs = window.require('fs');
      const path = window.require('path');
      const baseDir = judgeResult === 'NG' ? 'C:\\Inspect\\NG' : 'C:\\Inspect\\PASS';
      
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      
      const savePath = path.join(baseDir, fileName);
      fs.writeFileSync(savePath, buffer);
      console.log(`✅ 병합 이미지 저장 완료: ${savePath}`);
      
    } catch (error) {
      console.error('❌ 병합 이미지 저장 실패:', error);
    }
  };

  // 판정 로직을 처리하는 중앙 함수
  const handleJudge = async (result) => {
    try {
      // 1. EEPROM 데이터 사용 (props로 받은 데이터)
      console.log('📡 EEPROM 데이터 사용:', eepromData);

      // 2. 병합된 스크린샷 저장 (두 카메라를 가로로 합친 하나의 이미지)
      await saveMergedScreenshot(result, eepromData);

      // 니들 DOWN
      sendNeedleDown()
      
      // 상태 초기화
      if (onReset) onReset()
      
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
          disabled={!isStarted || !hasNeedleTip}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip) ? '#C22727' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: (isStarted && hasNeedleTip) ? 1 : 0.6
          }}
        >
          NG
        </Button>
        
        {/* PASS 버튼 */}
        <Button
          onClick={handlePassClick}
          disabled={!isStarted || !hasNeedleTip}
          style={{
            flex: 1,
            backgroundColor: (isStarted && hasNeedleTip) ? '#0CB56C' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: (isStarted && hasNeedleTip) ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: (isStarted && hasNeedleTip) ? 1 : 0.6
          }}
        >
          PASS
        </Button>
      </div>
    </Panel>
  )
}
