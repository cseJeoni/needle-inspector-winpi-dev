"use client"

import { useState, useEffect } from "react"
import "./CameraSelector.css"

const CameraSelector = ({ onCamerasSelected }) => {
  const [cameras, setCameras] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCamera1, setSelectedCamera1] = useState(null)
  const [selectedCamera2, setSelectedCamera2] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [shouldReloadOnReady, setShouldReloadOnReady] = useState(false)
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    const electronAvailable = typeof window !== "undefined" && window.electronAPI
    setIsElectron(!!electronAvailable)

    loadCameras()

    if (electronAvailable) {
      const handleCameraServerReady = () => {
        console.log("[CameraSelector] 카메라 서버 준비 완료")
        if (shouldReloadOnReady) {
          console.log("[CameraSelector] 카메라 연결 완료 - 상태 저장 후 페이지 새로고침")
          // 카메라 연결 완료 상태를 localStorage에 저장
          localStorage.setItem('cameraConnected', 'true')
          localStorage.setItem('cameraConnectedTime', Date.now().toString())
          // 페이지 새로고침으로 카메라 화면 초기화
          window.location.reload()
        }
      }

      window.electronAPI.onCameraServerReady(handleCameraServerReady)
    }
  }, [shouldReloadOnReady])

  const loadCameras = async () => {
    try {
      setLoading(true)
      setError(null)
      console.log("[CameraSelector] 카메라 목록 조회 중...")

      if (typeof window === "undefined" || !window.electronAPI) {
        // Demo mode for browser preview
        console.log("[CameraSelector] 데모 모드 - Mock 카메라 데이터 사용")
        const mockCameras = [
          { index: 0, name: "HD Pro Webcam", is_dino: true, width: 1920, height: 1080 },
          { index: 1, name: "USB Camera", is_dino: false, width: 1280, height: 720 },
          { index: 2, name: "Dino-Lite Camera", is_dino: true, width: 1920, height: 1080 },
          { index: 3, name: "Integrated Camera", is_dino: false, width: 1280, height: 720 },
        ]

        // Simulate loading delay
        await new Promise((resolve) => setTimeout(resolve, 1000))

        setCameras(mockCameras)
        setLoading(false)
        return
      }

      const result = await window.electronAPI.listCameras()

      if (result.success) {
        console.log(`[CameraSelector] 카메라 ${result.count}개 발견:`, result.cameras)
        setCameras(result.cameras)
      } else {
        throw new Error(result.error || "카메라 목록을 불러올 수 없습니다.")
      }
    } catch (err) {
      console.error("[CameraSelector] 카메라 목록 조회 실패:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!selectedCamera1) {
      alert("최소한 카메라 1개를 선택해주세요.")
      return
    }

    if (!isElectron) {
      console.log("[CameraSelector] 데모 모드 - 연결 시뮬레이션")
      setConnecting(true)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      alert("데모 모드입니다. Electron 환경에서 실행하면 실제 카메라에 연결됩니다.")
      setConnecting(false)
      if (onCamerasSelected) {
        onCamerasSelected()
      }
      return
    }

    try {
      setConnecting(true)
      setShouldReloadOnReady(true)
      console.log(
        `[CameraSelector] 카메라 서버 시작: Camera 1=${selectedCamera1}, Camera 2=${selectedCamera2 || "None"}`,
      )

      const result = await window.electronAPI.startCameraServer(selectedCamera1, selectedCamera2 || selectedCamera1)

      if (result.success) {
        console.log("[CameraSelector] 카메라 서버 시작 성공 - 서버 준비 대기 중...")
      } else {
        throw new Error(result.error || "카메라 서버 시작 실패")
      }
    } catch (err) {
      console.error("[CameraSelector] 카메라 연결 실패:", err)
      alert(`카메라 연결 실패: ${err.message}`)
      setConnecting(false)
      setShouldReloadOnReady(false)
    }
  }

  if (loading) {
    return (
      <div className="camera-selector-overlay">
        <div className="camera-selector-loading">
          <div className="loading-spinner-container">
            <div className="loading-spinner-track"></div>
            <div className="loading-spinner"></div>
          </div>
          <div className="loading-text">
            <p className="loading-title">카메라 검색 중</p>
            <p className="loading-subtitle">잠시만 기다려주세요</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="camera-selector-overlay">
        <div className="camera-selector-error">
          <div className="error-icon">
            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="error-content">
            <h2 className="error-title">오류 발생</h2>
            <p className="error-message">{error}</p>
          </div>
          <button onClick={loadCameras} className="btn btn-primary">
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  if (cameras.length === 0) {
    return (
      <div className="camera-selector-overlay">
        <div className="camera-selector-empty">
          <div className="empty-icon">
            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div className="empty-content">
            <h2 className="empty-title">카메라를 찾을 수 없습니다</h2>
            <p className="empty-message">사용 가능한 카메라가 없습니다</p>
          </div>
          <button onClick={loadCameras} className="btn btn-primary">
            다시 검색
          </button>
        </div>
      </div>
    )
  }

  if (connecting) {
    return (
      <div className="camera-selector-overlay">
        <div className="camera-selector-loading">
          <div className="loading-spinner-container">
            <div className="loading-spinner-track"></div>
            <div className="loading-spinner"></div>
          </div>
          <div className="loading-text">
            <p className="loading-title">카메라 로딩 중</p>
            <p className="loading-subtitle">카메라 서버를 시작하고 있습니다</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="camera-selector-overlay">
      <div className="camera-selector-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="header-content">
            <h2 className="header-title">카메라 선택</h2>
            <p className="header-subtitle">사용할 카메라를 선택해주세요</p>
          </div>
          <button
            onClick={() => {
              if (onCamerasSelected) {
                onCamerasSelected()
              }
            }}
            className="close-button"
            title="닫기"
          >
            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!isElectron && (
          <div className="demo-banner">
            <div className="demo-banner-content">
              <svg className="demo-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="demo-title">데모 모드</p>
                <p className="demo-subtitle">Electron 환경에서 실행하면 실제 카메라에 연결됩니다.</p>
              </div>
            </div>
          </div>
        )}

        <div className="camera-info-bar">
          <div className="camera-count-badge">
            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {cameras.length}개의 카메라 감지됨
          </div>

          <button onClick={loadCameras} className="refresh-button">
            <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            카메라 조회
          </button>
        </div>

        {/* Camera 1 Selection */}
        <div className="camera-section">
          <label className="section-label">
            카메라 1 <span className="required">*</span>
          </label>
          <div className="camera-grid">
            {cameras.map((camera) => (
              <button
                key={camera.index}
                onClick={() => setSelectedCamera1(camera.index)}
                className={`camera-card ${selectedCamera1 === camera.index ? "camera-card--selected" : ""}`}
              >
                <div className="camera-card-content">
                  <div className={`camera-icon ${selectedCamera1 === camera.index ? "camera-icon--selected" : ""}`}>
                    <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="camera-info">
                    <div className="camera-name-row">
                      <p className="camera-name">{camera.name}</p>
                      {camera.is_dino && <span className="dino-badge">Dino</span>}
                    </div>
                    <p className="camera-details">
                      Index: {camera.index}
                      {camera.width && ` • ${camera.width}×${camera.height}`}
                    </p>
                  </div>
                  {selectedCamera1 === camera.index && (
                    <div className="check-icon">
                      <svg className="icon" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Camera 2 Selection */}
        <div className="camera-section">
          <label className="section-label">
            카메라 2 <span className="optional">(선택사항)</span>
          </label>
          <div className="camera-grid">
            {cameras.map((camera) => (
              <button
                key={camera.index}
                onClick={() => setSelectedCamera2(camera.index === selectedCamera2 ? null : camera.index)}
                disabled={camera.index === selectedCamera1}
                className={`camera-card ${
                  camera.index === selectedCamera1
                    ? "camera-card--disabled"
                    : selectedCamera2 === camera.index
                      ? "camera-card--selected-green"
                      : ""
                }`}
              >
                <div className="camera-card-content">
                  <div
                    className={`camera-icon ${
                      camera.index === selectedCamera1
                        ? "camera-icon--disabled"
                        : selectedCamera2 === camera.index
                          ? "camera-icon--selected-green"
                          : ""
                    }`}
                  >
                    <svg className="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div className="camera-info">
                    <div className="camera-name-row">
                      <p className={`camera-name ${camera.index === selectedCamera1 ? "camera-name--disabled" : ""}`}>
                        {camera.name}
                      </p>
                      {camera.is_dino && (
                        <span
                          className={`dino-badge ${camera.index === selectedCamera1 ? "dino-badge--disabled" : ""}`}
                        >
                          Dino
                        </span>
                      )}
                    </div>
                    <p
                      className={`camera-details ${camera.index === selectedCamera1 ? "camera-details--disabled" : ""}`}
                    >
                      Index: {camera.index}
                      {camera.width && ` • ${camera.width}×${camera.height}`}
                      {camera.index === selectedCamera1 && " • 이미 선택됨"}
                    </p>
                  </div>
                  {selectedCamera2 === camera.index && (
                    <div className="check-icon check-icon--green">
                      <svg className="icon" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {!selectedCamera2 && <p className="helper-text">선택하지 않으면 카메라 1이 사용됩니다</p>}
        </div>

        {/* Connect Button */}
        <button
          onClick={handleConnect}
          disabled={!selectedCamera1 || connecting}
          className={`btn btn-connect ${!selectedCamera1 || connecting ? "btn-connect--disabled" : ""}`}
        >
          {connecting ? (
            <span className="btn-content">
              <div className="btn-spinner"></div>
              연결 중...
            </span>
          ) : (
            "연결하기"
          )}
        </button>
      </div>
    </div>
  )
}

export default CameraSelector
