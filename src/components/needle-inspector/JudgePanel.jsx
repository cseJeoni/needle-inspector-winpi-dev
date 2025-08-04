import Panel from "./Panel"
import { Button } from "./Button"

export default function JudgePanel({ onJudge, isStarted, onReset, camera1Ref, camera2Ref, hasNeedleTip = true }) {
  // 니들 DOWN 명령 전송 함수
  const sendNeedleDown = () => {
    try {
      const needleWs = new WebSocket('ws://192.168.0.122:8765')
      needleWs.onopen = () => {
        console.log('판정 후 니들 DOWN 명령 전송')
        needleWs.send(JSON.stringify({ cmd: "move", position: 0, mode: "position" })) // 니들 DOWN
        needleWs.close()
      }
    } catch (error) {
      console.error('니들 DOWN 명령 전송 실패:', error)
    }
  }

  // EEPROM 데이터 읽기 함수
  const readEepromData = async () => {
    try {
      console.log('📖 EEPROM 데이터 읽기 시작...')
      const ws = new WebSocket('ws://192.168.0.122:8765')
      
      const eepromData = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('EEPROM 읽기 타임아웃'))
        }, 5000)
        
        ws.onopen = () => {
          console.log('📡 EEPROM 읽기 WebSocket 연결됨')
          ws.send(JSON.stringify({ cmd: "eeprom_read" }))
        }
        
        ws.onmessage = (event) => {
          try {
            const response = JSON.parse(event.data)
            console.log('📖 EEPROM 응답:', response)
            
            if (response.type === 'eeprom_read') {
              clearTimeout(timeout)
              ws.close()

              // DataSettingsPanel의 검증된 방식으로 수정
              if (response.result && response.result.success) {
                console.log('✅ EEPROM 데이터 읽기 성공:', response.result);
                resolve(response.result);
              } else {
                console.error('❌ EEPROM 읽기 실패:', response.result?.error || '결과 데이터 없음');
                resolve(null);
              }
            }
          } catch (error) {
            console.error('❌ EEPROM 응답 파싱 실패:', error)
            clearTimeout(timeout)
            ws.close()
            resolve(null)
          }
        }
        
        ws.onerror = (error) => {
          console.error('❌ EEPROM WebSocket 오류:', error)
          clearTimeout(timeout)
          ws.close()
          resolve(null)
        }
      })
      
      return eepromData
    } catch (error) {
      console.error('❌ EEPROM 데이터 읽기 실패:', error)
      return null
    }
  }

  // 판정 결과를 받아 스크린샷을 저장하는 함수
  const saveScreenshot = async (judgeResult, cameraRef, eepromData) => {
    if (!cameraRef.current) {
      console.error('카메라 ref가 없습니다.');
      return;
    }

    // judgeResult와 eepromData를 captureImage로 전달
    const imageData = await cameraRef.current.captureImage(judgeResult, eepromData);

    if (imageData) {
      const blob = await (await fetch(imageData)).blob();
      const buffer = Buffer.from(await blob.arrayBuffer());
      const cameraTitle = cameraRef.current.getTitle(); // ref에서 직접 title 가져오기
      const date = new Date();
      const formattedDate = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
      const fileName = `${formattedDate}_${formattedTime}_${cameraTitle}_${judgeResult}.png`;

      const fs = window.require('fs');
      const path = window.require('path');
      const baseDir = judgeResult === 'NG' ? 'C:\\Inspect\\NG' : 'C:\\Inspect\\PASS';
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      const savePath = path.join(baseDir, fileName);

      fs.writeFileSync(savePath, buffer);
      console.log(`✅ ${fileName} 저장 완료: ${savePath}`);
    } else {
      console.error('❌ 이미지 데이터가 없어 파일을 저장할 수 없습니다.');
    }
  };

  // 판정 로직을 처리하는 중앙 함수
  const handleJudge = async (result) => {
    try {
      // 1. EEPROM 데이터 읽기 (완료될 때까지 기다림)
      console.log('📡 EEPROM 데이터 읽기 시작...');
      const eepromData = await readEepromData();
      console.log('✅ EEPROM 데이터 읽기 완료:', eepromData);

      // 2. 양쪽 카메라에 대해 스크린샷 저장
      await saveScreenshot(result, camera1Ref, eepromData);
      await saveScreenshot(result, camera2Ref, eepromData);

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
