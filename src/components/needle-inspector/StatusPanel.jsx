import { useState } from "react"
import Panel from "./Panel"
import { Input } from "./Input"
import { Button } from "./Button"

export default function StatusPanel({ mode, workStatus = 'waiting', needleTipConnected = false }) {
  // 로그인 상태 관리
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [loggedInUser, setLoggedInUser] = useState('')

  // 로그인 처리 함수
  const handleLogin = () => {
    if (username.trim() && password.trim()) {
      setIsLoggedIn(true)
      setLoggedInUser(username)
      setUsername('')
      setPassword('')
      console.log(`작업자 로그인: ${username}`)
    }
  }

  // 로그아웃 처리 함수
  const handleLogout = () => {
    setIsLoggedIn(false)
    setLoggedInUser('')
    console.log('로그아웃 완료')
  }

  // 상태에 따른 스타일과 메시지 정의
  const getStatusInfo = (status) => {
    switch (status) {
      case 'waiting':
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
      case 'disconnected':
        return { bg: 'bg-[#F3950F]', text: '니들팁 없음', textColor: 'text-white' }
      case 'write_success':
        return { bg: 'bg-[#0CB56C]', text: '저장 완료', textColor: 'text-white' }
      case 'write_failed':
        return { bg: 'bg-[#C22727]', text: '저장 실패', textColor: 'text-white' }
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

  const statusInfo = getStatusInfo(effectiveStatus)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1dvh' }}>
      <Panel title="작업 상태">
        <div className={`${statusInfo.bg} rounded-md flex items-center justify-center`} style={{ height: '10dvh' }}>
          <span className={`text-2xl font-bold ${statusInfo.textColor}`}>{statusInfo.text}</span>
        </div>
      </Panel>
      
      <Panel title="작업자 로그인">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1dvh' }}>
          {!isLoggedIn ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw' }}>
                <label style={{ width: '7dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>이름</label>
                <Input 
                  type="text" 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.2dvh', 
                    height: '3.5dvh' 
                  }} 
                  placeholder="이름을 입력하세요"
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1dvw' }}>
                <label style={{ width: '7dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>비밀번호</label>
                <Input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#171C26', 
                    border: '1px solid #374151', 
                    color: 'white', 
                    fontSize: '1.2dvh', 
                    height: '3.5dvh' 
                  }} 
                  placeholder="비밀번호를 입력하세요"
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>
              <Button 
                onClick={handleLogin}
                disabled={!username.trim() || !password.trim()}
                style={{
                  width: '100%',
                  fontWeight: 'bold',
                  padding: '0.8dvh 0',
                  fontSize: '1.5dvh',
                  backgroundColor: (!username.trim() || !password.trim()) ? '#374151' : '#4ADE80',
                  color: (!username.trim() || !password.trim()) ? '#9CA3AF' : 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: (!username.trim() || !password.trim()) ? 'not-allowed' : 'pointer'
                }}
              >
                로그인
              </Button>
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
                <span style={{ fontSize: '1.5dvh', fontWeight: 'bold' }}>
                  환영합니다, {loggedInUser}님!
                </span>
                <Button 
                  onClick={handleLogout}
                  style={{
                    padding: '0.5dvh 1dvw',
                    fontSize: '1.2dvh',
                    backgroundColor: '#DC2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer'
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
