import { useState, useEffect } from 'react'
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from 'firebase/auth'
import { auth, db } from '../firebase/config'
import { doc, getDoc } from 'firebase/firestore'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const userDocRef = doc(db, 'users', user.uid)
          const userDoc = await getDoc(userDocRef)
          
          if (userDoc.exists()) {
            setUser({ ...user, ...userDoc.data() })
          } else {
            setUser(user)
          }
        } else {
          setUser(null)
        }
      } catch (e) {
        console.error("Firestore에서 사용자 정보 가져오기 실패:", e)
        const errorMessage = "사용자 정보를 가져오는 데 실패했습니다."
        setError(errorMessage)
        setTimeout(() => setError(null), 3000) // 3초 후 에러 메시지 초기화
      } finally {
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  // 앱 종료 시 자동 로그아웃
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (user) {
        try {
          await signOut(auth)
          console.log('앱 종료 시 자동 로그아웃 완료')
        } catch (error) {
          console.error('앱 종료 시 로그아웃 실패:', error)
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user])

  const login = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const result = await signInWithEmailAndPassword(auth, email, password)
      console.log('로그인 성공:', result.user.email)
      // onAuthStateChanged가 Firestore 데이터 로딩을 처리하므로 여기서는 반환만 함
      return { success: true, user: result.user }
    } catch (error) {
      console.error('로그인 실패:', error)
      let errorMessage = '로그인에 실패했습니다.'
      
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

  const register = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const result = await createUserWithEmailAndPassword(auth, email, password)
      console.log('회원가입 성공:', result.user.email)
      // onAuthStateChanged가 Firestore 데이터 로딩을 처리하므로 여기서는 반환만 함
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
