import { useState, useEffect } from 'react'
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword 
} from 'firebase/auth'
import { auth } from '../firebase/config'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 인증 상태 변화 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  // 로그인 함수
  const login = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('로그인 성공:', result.user.email)
      return { success: true, user: result.user }
    } catch (error) {
      console.error('로그인 실패:', error)
      let errorMessage = '로그인에 실패했습니다.'
      
      // Firebase 에러 코드에 따른 한국어 메시지
      switch (error.code) {
        case 'auth/user-not-found':
          errorMessage = '등록되지 않은 이메일입니다.'
          break
        case 'auth/wrong-password':
          errorMessage = '비밀번호가 올바르지 않습니다.'
          break
        case 'auth/invalid-email':
          errorMessage = '올바르지 않은 이메일 형식입니다.'
          break
        case 'auth/too-many-requests':
          errorMessage = '너무 많은 로그인 시도가 있었습니다. 잠시 후 다시 시도해주세요.'
          break
        default:
          errorMessage = error.message
      }
      
      setError(errorMessage)
      setLoading(false)
      setTimeout(() => setError(null), 3000) // 3초 후 에러 메시지 초기화
      return { success: false, error: errorMessage }
    }
  }

  // 로그아웃 함수
  const logout = async () => {
    try {
      setLoading(true)
      setError(null)
      await signOut(auth)
      console.log('로그아웃 성공')
      return { success: true }
    } catch (error) {
      console.error('로그아웃 실패:', error)
      const errorMessage = '로그아웃에 실패했습니다.';
      setError(errorMessage);
      setLoading(false);
      setTimeout(() => setError(null), 3000); // 3초 후 에러 메시지 초기화
      return { success: false, error: errorMessage };
    }
  }

  // 회원가입 함수 (관리자용)
  const register = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const result = await createUserWithEmailAndPassword(auth, email, password)
      console.log('회원가입 성공:', result.user.email)
      return { success: true, user: result.user }
    } catch (error) {
      console.error('회원가입 실패:', error)
      let errorMessage = '회원가입에 실패했습니다.'
      
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage = '이미 사용 중인 이메일입니다.'
          break
        case 'auth/weak-password':
          errorMessage = '비밀번호가 너무 약합니다. 6자리 이상 입력해주세요.'
          break
        case 'auth/invalid-email':
          errorMessage = '올바르지 않은 이메일 형식입니다.'
          break
        default:
          errorMessage = error.message
      }
      
      setError(errorMessage)
      setLoading(false)
      setTimeout(() => setError(null), 3000) // 3초 후 에러 메시지 초기화
      return { success: false, error: errorMessage }
    }
  }

  return {
    user,
    loading,
    error,
    login,
    logout,
    register,
    isAuthenticated: !!user
  }
}
