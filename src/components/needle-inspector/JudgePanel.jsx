import Panel from "./Panel"
import { Button } from "./Button"

export default function JudgePanel({ onJudge, isStarted, onReset }) {
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

  // 카메라 프레임 캡처 함수
  const saveScreenshot = async (result) => {
    console.log(`📷 카메라 프레임 캡처 시작: ${result}`)
    
    try {
      const fs = window.require('fs')
      const path = window.require('path')
      
      console.log('📸 카메라 서버에서 직접 프레임 가져오기...')
      
      let imageBuffer
      
      // 가장 간단하고 확실한 방법: 카메라 서버에서 직접 가져오기
      const cameraResponse = await fetch('http://localhost:5000/capture', {
        method: 'GET',
        headers: {
          'Accept': 'image/jpeg'
        }
      })
      
      if (cameraResponse.ok) {
        const arrayBuffer = await cameraResponse.arrayBuffer()
        imageBuffer = Buffer.from(arrayBuffer)
        console.log(`✅ 카메라 프레임 캡처 성공 (${imageBuffer.length} bytes)`)
      } else {
        throw new Error(`Camera server response: ${cameraResponse.status}`)
      }
      
      console.log(`💾 이미지 데이터 크기: ${imageBuffer.length} bytes`)
      
      // 저장 경로 설정
      const baseDir = result === 'NG' ? 'C:\\Inspect\\NG' : 'C:\\Inspect\\PASS'
      console.log(`📁 저장 경로: ${baseDir}`)
      
      // 디렉토리 생성 (없으면)
      if (!fs.existsSync(baseDir)) {
        console.log('📁 디렉토리 생성 중...')
        fs.mkdirSync(baseDir, { recursive: true })
        console.log('✅ 디렉토리 생성 완료')
      }
      
      // 기존 파일 개수 확인하여 다음 번호 결정
      const files = fs.readdirSync(baseDir).filter(file => file.endsWith('.jpg'))
      const nextNumber = files.length + 1
      console.log(`📊 기존 파일 개수: ${files.length}, 다음 번호: ${nextNumber}`)
      
      const filename = `${nextNumber}.jpg`
      const filepath = path.join(baseDir, filename)
      console.log(`💾 저장할 파일 경로: ${filepath}`)
      
      // 이미지 저장
      fs.writeFileSync(filepath, imageBuffer)
      console.log(`✅ 카메라 이미지 저장 완료: ${filepath}`)
      
      // 파일 존재 확인
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath)
        console.log(`✅ 파일 저장 확인: ${filepath} (${stats.size} bytes)`)
      } else {
        console.error('❌ 파일 저장 실패: 파일이 생성되지 않음')
      }
      
    } catch (error) {
      console.error('❌ 카메라 이미지 저장 실패:', error)
      console.error('❌ 에러 세부정보:', error.stack)
    }
  }

  const handleNGClick = async () => {
    console.log("NG 판정")
    
    // 1. 니들 DOWN
    sendNeedleDown()
    
    // 2. 카메라 프레임 캡처
    await saveScreenshot('NG')
    
    // 3. 상태 초기화
    if (onReset) onReset()
    
    // 4. 콜백 호출
    if (onJudge) onJudge('NG')
  }

  const handlePassClick = async () => {
    console.log("PASS 판정")
    
    // 1. 니들 DOWN
    sendNeedleDown()
    
    // 2. 카메라 프레임 캡처
    await saveScreenshot('PASS')
    
    // 3. 상태 초기화
    if (onReset) onReset()
    
    // 4. 콜백 호출
    if (onJudge) onJudge('PASS')
  }

  return (
    <Panel title="판정">
      <div style={{ display: 'flex', gap: '1dvw', height: '100%' }}>
        {/* NG 버튼 */}
        <Button
          onClick={handleNGClick}
          disabled={!isStarted}
          style={{
            flex: 1,
            backgroundColor: isStarted ? '#C22727' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isStarted ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: isStarted ? 1 : 0.6
          }}
        >
          NG
        </Button>
        
        {/* PASS 버튼 */}
        <Button
          onClick={handlePassClick}
          disabled={!isStarted}
          style={{
            flex: 1,
            backgroundColor: isStarted ? '#0CB56C' : '#6B7280',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isStarted ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh',
            opacity: isStarted ? 1 : 0.6
          }}
        >
          PASS
        </Button>
      </div>
    </Panel>
  )
}
