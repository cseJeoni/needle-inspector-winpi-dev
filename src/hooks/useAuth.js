import { useState, useEffect, createContext, useContext } from 'react'

// 사용자 캐시 (메모리에 저장)
let usersCache = {}
let cacheLoaded = false

// Auth Context 생성
const AuthContext = createContext()

// Auth Provider 컴포넌트
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // 세션 스토리지에서 로그인 상태 복원 (CSV 기반 로그인만 허용)
  useEffect(() => {
    const savedUser = sessionStorage.getItem('user')
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser)
        // CSV 기반 로그인 데이터인지 확인 (birthLast4 속성이 있어야 함)
        if (userData && userData.birthLast4 && userData.id) {
          setUser(userData)
          console.log('[AUTH] 세션에서 CSV 기반 사용자 정보 복원:', userData.id)
        } else {
          // 기존 Firebase 세션 데이터는 제거
          console.log('[AUTH] 기존 Firebase 세션 데이터 제거')
          sessionStorage.removeItem('user')
        }
      } catch (e) {
        console.error('저장된 사용자 정보 파싱 실패:', e)
        sessionStorage.removeItem('user')
      }
    }
  }, [])

  // 앱 종료 시 자동 로그아웃
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user) {
        sessionStorage.removeItem('user')
        console.log('앱 종료 시 자동 로그아웃 완료')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user])

  // CSV 파일에서 사용자 정보 로드 (IPC 사용)
  const loadUsersFromCSV = async () => {
    if (cacheLoaded) return true

    try {
      // Electron IPC를 통해 메인 프로세스에서 CSV 파일 읽기
      const result = await window.electronAPI.loadUsersCSV()
      
      if (result.success) {
        usersCache = result.users
        cacheLoaded = true
        console.log(`[OK] 사용자 정보 로드 완료: ${Object.keys(usersCache).length}명`)
        return true
      } else {
        console.error('[ERROR] 사용자 정보 로드 실패:', result.error)
        return false
      }
    } catch (error) {
      console.error('[ERROR] 사용자 정보 로드 실패:', error)
      return false
    }
  }

  const login = async (id, password) => {
    try {
      setLoading(true)
      setError(null)

      // CSV 파일에서 사용자 정보 로드
      const loadSuccess = await loadUsersFromCSV()
      if (!loadSuccess) {
        const errorMessage = '사용자 정보를 로드할 수 없습니다.'
        setError(errorMessage)
        setLoading(false)
        setTimeout(() => setError(null), 3000)
        return { success: false, error: errorMessage }
      }

      // 사용자 인증 확인
      if (usersCache[id] && usersCache[id].pw === password) {
        const userData = { 
          id: id, 
          birth: usersCache[id].birth,
          birthLast4: usersCache[id].birth ? usersCache[id].birth.slice(-4) : '0000' // birth 끝 4자리
        }
        setUser(userData)
        sessionStorage.setItem('user', JSON.stringify(userData))
        console.log('[AUTH] 로그인 성공:', id, 'Birth 끝4자리:', userData.birthLast4)
        setLoading(false)
        return { success: true, user: userData }
      } else {
        const errorMessage = '아이디 또는 비밀번호가 올바르지 않습니다.'
        setError(errorMessage)
        setLoading(false)
        setTimeout(() => setError(null), 3000)
        console.log('[AUTH] 로그인 실패:', id)
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      console.error('로그인 실패:', error)
      const errorMessage = '로그인에 실패했습니다.'
      setError(errorMessage)
      setLoading(false)
      setTimeout(() => setError(null), 3000)
      return { success: false, error: errorMessage }
    }
  }

  const logout = async () => {
    try {
      setLoading(true)
      setError(null)
      
      setUser(null)
      sessionStorage.removeItem('user')
      console.log('로그아웃 성공')
      
      setLoading(false)
      return { success: true }
    } catch (error) {
      console.error('로그아웃 실패:', error)
      const errorMessage = '로그아웃에 실패했습니다.'
      setError(errorMessage)
      setLoading(false)
      setTimeout(() => setError(null), 3000)
      return { success: false, error: errorMessage }
    }
  }

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// useAuth 훅 - Context를 사용
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
