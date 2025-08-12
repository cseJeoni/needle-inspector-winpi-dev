import React, { useState, useRef, useEffect } from 'react';

const ElectronCameraTest = () => {
  const [cameraList, setCameraList] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const canvasRef = useRef(null);

  // Electron API 사용 가능 여부 확인
  const isElectronAvailable = typeof window !== 'undefined' && window.electronAPI;

  useEffect(() => {
    if (!isElectronAvailable) {
      setError('Electron 환경에서만 사용 가능합니다');
      return;
    }

    console.log('[ElectronCameraTest] 컴포넌트 초기화 및 리스너 등록');

    // 카메라 프레임 수신 리스너 등록
    window.electronAPI.onCameraFrame((frameData) => {
      console.log('[ElectronCameraTest] 카메라 프레임 수신:', frameData.success, frameData.timestamp);
      
      if (frameData.success && canvasRef.current) {
        drawImageToCanvas(frameData.image);
      } else {
        console.warn('[ElectronCameraTest] 프레임 데이터 오류 또는 캔버스 없음:', {
          success: frameData.success,
          hasCanvas: !!canvasRef.current
        });
      }
    });

    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      console.log('[ElectronCameraTest] 컴포넌트 정리 중...');
      if (window.electronAPI) {
        window.electronAPI.removeCameraFrameListener();
        stopCameraStream();
      }
    };
  }, [isElectronAvailable]);

  // 카메라 ID 목록 가져오기 (Electron IPC 사용)
  const getCameraIds = async () => {
    if (!isElectronAvailable) {
      setError('Electron API를 사용할 수 없습니다');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const data = await window.electronAPI.getCameraIds();
      
      if (data.success) {
        setCameraList(data.cameras);
        console.log('카메라 목록 (Electron):', data.cameras);
      } else {
        setError(data.error || '카메라 ID를 가져오는데 실패했습니다');
      }
    } catch (err) {
      setError('Electron IPC 통신 실패: ' + err.message);
      console.error('카메라 ID 가져오기 실패 (Electron):', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 특정 카메라 ID로 카메라 연결 (Electron IPC 사용)
  const connectCameraById = async (cameraId) => {
    if (!isElectronAvailable) {
      setError('Electron API를 사용할 수 없습니다');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      const data = await window.electronAPI.connectCameraById(cameraId);
      
      if (data.success) {
        setSelectedCameraId(cameraId);
        setSelectedCameraIndex(data.camera_index);
        console.log(`카메라 연결 성공 (Electron): ID=${cameraId}, Index=${data.camera_index}`);
      } else {
        setError(data.error || '카메라 연결에 실패했습니다');
      }
    } catch (err) {
      setError('카메라 연결 실패: ' + err.message);
      console.error('카메라 연결 실패 (Electron):', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 카메라 스트림 시작
  const startCameraStream = async () => {
    if (!isElectronAvailable || selectedCameraIndex < 0) {
      setError('카메라가 선택되지 않았습니다');
      return;
    }

    try {
      const result = await window.electronAPI.startCameraStream(selectedCameraIndex);
      
      if (result.success) {
        setIsStreaming(true);
        setError('');
        console.log('카메라 스트림 시작됨 (Electron)');
      } else {
        setError(result.error || '카메라 스트림 시작 실패');
      }
    } catch (err) {
      setError('카메라 스트림 시작 실패: ' + err.message);
      console.error('카메라 스트림 시작 실패 (Electron):', err);
    }
  };

  // 카메라 스트림 중지
  const stopCameraStream = async () => {
    if (!isElectronAvailable) return;

    try {
      const result = await window.electronAPI.stopCameraStream();
      
      if (result.success) {
        setIsStreaming(false);
        console.log('카메라 스트림 중지됨 (Electron)');
        
        // 캔버스 클리어
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    } catch (err) {
      console.error('카메라 스트림 중지 실패 (Electron):', err);
    }
  };

  // 이미지를 캔버스에 그리기
  const drawImageToCanvas = (base64Image) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // 캔버스 크기 설정
      canvas.width = img.width;
      canvas.height = img.height;

      // 이미지 그리기
      ctx.drawImage(img, 0, 0);

      // 카메라 정보 오버레이
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 350, 100);

      ctx.fillStyle = 'white';
      ctx.font = '14px Arial';
      ctx.fillText(`카메라 ID: ${selectedCameraId}`, 20, 30);
      ctx.fillText(`카메라 인덱스: ${selectedCameraIndex}`, 20, 50);
      ctx.fillText(`해상도: ${canvas.width}x${canvas.height}`, 20, 70);
      ctx.fillText(`스트리밍: ${isStreaming ? 'ON' : 'OFF'}`, 20, 90);
    };

    img.src = base64Image;
  };

  // 단일 프레임 캡처
  const captureFrame = async () => {
    if (!isElectronAvailable || selectedCameraIndex < 0) {
      setError('카메라가 선택되지 않았습니다');
      return;
    }

    try {
      const frameData = await window.electronAPI.getCameraFrame(selectedCameraIndex);
      
      if (frameData.success) {
        drawImageToCanvas(frameData.image);
        console.log('프레임 캡처 성공 (Electron)');
      } else {
        setError(frameData.error || '프레임 캡처 실패');
      }
    } catch (err) {
      setError('프레임 캡처 실패: ' + err.message);
      console.error('프레임 캡처 실패 (Electron):', err);
    }
  };

  if (!isElectronAvailable) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Electron Native Camera Test</h2>
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '5px'
        }}>
          이 컴포넌트는 Electron 환경에서만 작동합니다.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>Electron Native Camera Test</h2>
      
      {/* 카메라 ID 가져오기 버튼 */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={getCameraIds}
          disabled={isLoading}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginRight: '10px'
          }}
        >
          {isLoading ? '로딩 중...' : '카메라 ID 목록 가져오기 (Electron)'}
        </button>

        {selectedCameraIndex >= 0 && (
          <>
            <button 
              onClick={captureFrame}
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                marginRight: '10px'
              }}
            >
              단일 프레임 캡처
            </button>

            <button 
              onClick={isStreaming ? stopCameraStream : startCameraStream}
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: isStreaming ? '#dc3545' : '#17a2b8',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isStreaming ? '스트림 중지' : '스트림 시작'}
            </button>
          </>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div style={{
          padding: '10px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {/* 카메라 목록 */}
      {cameraList.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3>연결된 Dino-Lite 카메라 목록:</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {cameraList.map((camera, index) => (
              <div 
                key={index}
                style={{
                  padding: '15px',
                  border: '1px solid #ddd',
                  borderRadius: '5px',
                  backgroundColor: selectedCameraId === camera.id ? '#e7f3ff' : '#f9f9f9'
                }}
              >
                <div><strong>인덱스:</strong> {camera.index}</div>
                <div><strong>이름:</strong> {camera.name}</div>
                <div><strong>ID:</strong> {camera.id}</div>
                <div><strong>ID (ASCII):</strong> {camera.id_ascii}</div>
                <button
                  onClick={() => connectCameraById(camera.id)}
                  disabled={isLoading}
                  style={{
                    marginTop: '10px',
                    padding: '8px 16px',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: isLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  이 카메라로 연결
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 카메라 스트림 표시 */}
      {selectedCameraId && (
        <div style={{ marginTop: '20px' }}>
          <h3>Dino-Lite 카메라 스트림 (ID: {selectedCameraId})</h3>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              style={{
                border: '2px solid #007bff',
                borderRadius: '5px',
                maxWidth: '100%',
                height: 'auto',
                backgroundColor: '#f8f9fa'
              }}
            />
          </div>
        </div>
      )}

      {/* 사용법 안내 */}
      <div style={{
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '5px'
      }}>
        <h4>Electron Native API 사용법:</h4>
        <ol>
          <li>"카메라 ID 목록 가져오기" 버튼을 클릭하여 Dino-Lite 카메라들의 실제 하드웨어 ID를 확인합니다.</li>
          <li>원하는 카메라의 "이 카메라로 연결" 버튼을 클릭합니다.</li>
          <li>"단일 프레임 캡처" 버튼으로 한 장의 사진을 찍거나, "스트림 시작" 버튼으로 실시간 영상을 봅니다.</li>
          <li>캔버스에 실제 Dino-Lite 카메라의 영상이 표시됩니다.</li>
        </ol>
        <p><strong>장점:</strong> 브라우저 제약 없이 Dino-Lite 하드웨어에 직접 접근하여 실제 카메라 ID와 매칭됩니다.</p>
      </div>
    </div>
  );
};

export default ElectronCameraTest;
