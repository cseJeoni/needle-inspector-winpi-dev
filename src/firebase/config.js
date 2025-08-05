// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore' 

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA4ClkyFOy0OkgZweM2L0wJzokZWcwaSeA",
  authDomain: "needle-inspector-auth.firebaseapp.com",
  projectId: "needle-inspector-auth",
  storageBucket: "needle-inspector-auth.appspot.com",
  messagingSenderId: "181627104595",
  appId: "1:181627104595:web:6bb295667b15086125c5a6",
  measurementId: "G-737KCV9ZVZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app)

// Firestore 데이터베이스 초기화
export const db = getFirestore(app);  // 로그인에서 이걸 import해서 사용
