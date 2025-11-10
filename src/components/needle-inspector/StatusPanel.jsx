import { useState, useRef, useEffect } from "react"
import Panel from "./Panel"
import { Input } from "./Input"
import { Button } from "./Button"
import { useAuth } from "../../hooks/useAuth.jsx"
import errorAudio from "../../assets/audio/error.mp3"

export default function StatusPanel({ mode, workStatus = 'waiting', needleTipConnected = false, isWaitingEepromRead = false }) {
  // CSV 기반 Authentication 훅 사용
  const { user, loading, error, login, logout, isAuthenticated } = useAuth()
  
  // 로그인 폼 상태 관리
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginMessage, setLoginMessage] = useState('')
  
  // 오디오 객체 (오류 사운드용)
  const errorAudioRef = useRef(null)
  const prevWorkStatusRef = useRef(workStatus) // 이전 상태 추적용
  
  // 오디오 객체 초기화
  useEffect(() => {
    errorAudioRef.current = new Audio(errorAudio)
    errorAudioRef.current.preload = 'auto'
    
    return () => {
      if (errorAudioRef.current) {
        errorAudioRef.current.pause()
        errorAudioRef.current = null
      }
    }
  }, [])

  // 오류 사운드 재생 함수
  const playErrorSound = () => {
    if (errorAudioRef.current) {
      errorAudioRef.current.currentTime = 0 // 처음부터 재생
      errorAudioRef.current.play().catch(console.error)
      console.log('[MP3] 오류 발생 - error.mp3 재생')
    }
  }

  // workStatus 변경 감지 및 오류 사운드 재생
  useEffect(() => {
    const errorStatuses = ['motor_error', 'needle_short', 'write_failed', 'read_failed', 'resistance_abnormal']
    
    // 상태가 변경되었고, 새 상태가 오류 상태인 경우에만 사운드 재생
    if (prevWorkStatusRef.current !== workStatus && errorStatuses.includes(workStatus)) {
      console.log(`🔊 오류 상태 감지 (${workStatus}) - error.mp3 재생`)
      playErrorSound()
    }
    
    // 이전 상태 업데이트
    prevWorkStatusRef.current = workStatus
  }, [workStatus])

  // 로그인 처리 함수 (CSV 기반)
  const handleLogin = async () => {
    if (!userId.trim() || !password.trim()) {
      setLoginMessage('아이디와 비밀번호를 입력해주세요.')
      setTimeout(() => setLoginMessage(''), 3000)
      return;
    }

    setIsLoggingIn(true);
    const result = await login(userId.trim(), password.trim());
    
    if (result.success) {
      setUserId('');
      setPassword('');
      setLoginMessage('로그인 성공!')
      setTimeout(() => setLoginMessage(''), 3000)
    } else {
      setLoginMessage(result.error || '로그인에 실패했습니다.')
      setTimeout(() => setLoginMessage(''), 3000)
    }
    
    setIsLoggingIn(false);
  }

  // 로그아웃 처리 함수 (CSV 기반)
  const handleLogout = async () => {
    const result = await logout()
    
    if (result.success) {
      setLoginMessage('로그아웃되었습니다.')
      setTimeout(() => setLoginMessage(''), 3000)
      console.log('로그아웃 완료')
    } else {
      setLoginMessage(result.error || '로그아웃에 실패했습니다.')
      setTimeout(() => setLoginMessage(''), 3000)
    }
  }

  // Enter 키 처리
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoggingIn) {
      handleLogin()
    }
  }

  // 상태에 따른 스타일과 메시지 정의
  const getStatusInfo = (status, isWaitingRead = false) => {
    // write_success 상태일 때는 EEPROM 읽기 중이어도 "저장 완료" 우선 표시
    if (status === 'write_success') {
      return { bg: 'bg-[#0CB56C]', text: '저장 완료', textColor: 'text-white' }
    }
    
    // EEPROM 읽기 대기 중일 때 표시 (write_success가 아닌 경우에만)
    if (isWaitingRead) {
      return { bg: 'bg-[#F59E0B]', text: 'EEPROM 읽기 중...', textColor: 'text-white' }
    }
    
    switch (status) {
      case 'waiting':
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
      case 'disconnected':
        return { bg: 'bg-[#F3950F]', text: '니들팁 없음', textColor: 'text-white' }
      case 'write_failed':
        return { bg: 'bg-[#C22727]', text: '저장 실패', textColor: 'text-white' }
      case 'motor_error':
        return { bg: 'bg-[#C22727]', text: '모터 오류', textColor: 'text-white' }
      case 'resistance_abnormal':
        return { bg: 'bg-[#C22727]', text: '저항 비정상', textColor: 'text-white' }
      case 'needle_short':
        return { bg: 'bg-[#C22727]', text: '니들 쇼트', textColor: 'text-white' }
      default:
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
    }
  }

  // GPIO23 인터럽트 기반 니들팁 상태에 따라 실시간으로 상태 결정
  let effectiveStatus;
  if (!needleTipConnected) {
    // GPIO23이 HIGH일 때 '니들팁 없음' 표시
    effectiveStatus = 'disconnected';
  } else {
    // GPIO23이 LOW일 때 (니들팁 연결됨) workStatus를 따름
    effectiveStatus = workStatus;
  }

  const statusInfo = getStatusInfo(effectiveStatus, isWaitingEepromRead)

  return (
    <div style={{ height: '35dvh', display: 'flex', flexDirection: 'column', gap: '1dvh' }}>
      <Panel title={
        <h2 className="text-lg font-bold text-responsive">작업 상태</h2>
      }>
        <div className={`${statusInfo.bg} rounded-md flex items-center justify-center`} style={{ height: '10dvh' }}>
          <span className={`font-bold ${statusInfo.textColor}`} style={{ fontSize: '2.2dvh' }}>{statusInfo.text}</span>
        </div>
      </Panel>
      
      <Panel title={
        <h2 className="text-lg font-bold text-responsive">사용자 로그인</h2>
      }>
        <div>
          
          {/* Firebase 로딩 상태 */}
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              color: '#9CA3AF', 
              fontSize: '1.4dvh' 
            }}>
              인증 상태 확인 중...
            </div>
          ) : !isAuthenticated ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw', padding: '0.5dvh' }}>
                <label style={{ width: '7dvw', fontSize: '1.3dvh', color: '#D1D5DB' }}>아이디</label>
                <Input 
                  type="text" 
                  value={userId} 
                  onChange={(e) => setUserId(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.1dvh', 
                    height: '3dvh' 
                  }} 
                  placeholder="아이디를 입력하세요"
                  disabled={isLoggingIn}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw', padding: '0.5dvh' }}>
                <label style={{ width: '7dvw', fontSize: '1.3dvh', color: '#D1D5DB' }}>비밀번호</label>
                <Input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.1dvh', 
                    height: '3dvh' 
                  }} 
                  placeholder="비밀번호를 입력하세요"
                  disabled={isLoggingIn}
                />
              </div>
              {(error || loginMessage) ? (
                <div style={{
                  color: loginMessage.includes('성공') ? '#4ADE80' : '#F87171',
                  textAlign: 'center',
                  fontSize: '1.3dvh',
                  padding: '0.5dvh 0',
                  marginTop: '0.3dvh',
                  height: '3dvh', // 버튼과 높이를 맞춤
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                }}>
                  {error || loginMessage}
                </div>
              ) : (
                <Button
                  onClick={handleLogin}
                  disabled={!userId.trim() || !password.trim() || isLoggingIn}
                  style={{
                    width: '100%',
                    fontWeight: 'bold',
                    marginTop: '0.5dvh',

                    fontSize: '1.3dvh',
                    backgroundColor: (!userId.trim() || !password.trim() || isLoggingIn) ? '#374151' : '#4ADE80',
                    color: (!userId.trim() || !password.trim() || isLoggingIn) ? '#9CA3AF' : 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    height: '2.8dvh',
                  }}
                >
                  {isLoggingIn ? '로그인 중...' : '로그인'}
                </Button>
              )}
              

            </>
          ) : (
            <>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '1dvh',
                backgroundColor: '#0CB56C',
                borderRadius: '0.375rem',
                color: 'white'
              }}>
                <span style={{ fontSize: '1.3dvh', fontWeight: 'bold' }}>
                  작업자 : {user?.name || user?.id}
                </span>
                <Button 
                  onClick={handleLogout}
                  style={{
                    padding: '0.5dvh 1dvw',
                    fontSize: '1.3dvh',
                    backgroundColor: 'transparent',
                    color: 'white',
                    border: '1px solid white',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    height: '3dvh'
                  }}
                >
                  로그아웃
                </Button>
              </div>
              

            </>
          )}
        </div>
      </Panel>
    </div>
  )
}
