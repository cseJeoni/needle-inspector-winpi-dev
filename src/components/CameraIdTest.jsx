import React, { useState, useRef, useEffect } from 'react';

const CameraIdTest = () => {
  const [cameraList, setCameraList] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // 카메라 ID 목록 가져오기
  const getCameraIds = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('http://localhost:5001/get_camera_ids');
      const data = await response.json();
      
      if (data.success) {
        setCameraList(data.cameras);
        console.log('카메라 목록:', data.cameras);
      } else {
        setError(data.error || '카메라 ID를 가져오는데 실패했습니다');
      }
    } catch (err) {
      setError('서버 연결 실패: ' + err.message);
      console.error('카메라 ID 가져오기 실패:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 특정 카메라 ID로 카메라 연결
  const connectCameraById = async (cameraId) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('http://localhost:5001/connect_camera_by_id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ camera_id: cameraId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSelectedCameraId(cameraId);
        setSelectedCameraIndex(data.camera_index);
        console.log(`카메라 연결 성공: ID=${cameraId}, Index=${data.camera_index}`);
        
        // 카메라 스트림 시작
        startCameraStream(data.camera_index);
      } else {
        setError(data.error || '카메라 연결에 실패했습니다');
      }
    } catch (err) {
      setError('카메라 연결 실패: ' + err.message);
      console.error('카메라 연결 실패:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 브라우저의 카메라 장치 목록 가져오기
  const getBrowserCameras = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      console.log('브라우저 카메라 장치들:', videoDevices);
      return videoDevices;
    } catch (err) {
      console.error('브라우저 카메라 목록 가져오기 실패:', err);
      return [];
    }
  };

  // 카메라 스트림 시작 (브라우저의 첫 번째 카메라 사용)
  const startCameraStream = async (cameraIndex) => {
    try {
      // 기존 스트림 정리
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      // 브라우저의 카메라 장치 목록 가져오기
      const browserCameras = await getBrowserCameras();
      
      if (browserCameras.length === 0) {
        setError('브라우저에서 카메라를 찾을 수 없습니다');
        return;
      }

      // 카메라 인덱스에 해당하는 장치 선택 (없으면 첫 번째 카메라 사용)
      const targetCamera = browserCameras[Math.min(cameraIndex, browserCameras.length - 1)] || browserCameras[0];
      
      console.log(`카메라 ${cameraIndex}번 대신 브라우저 카메라 사용:`, targetCamera);

      // 새 스트림 시작
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: targetCamera.deviceId,
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });
      
      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      console.log('카메라 스트림 시작 성공');
      
    } catch (err) {
      console.error('카메라 스트림 시작 실패:', err);
      setError('카메라 스트림 시작 실패: ' + err.message);
      
      // 대안: 아무 제약 조건 없이 기본 카메라 시도
      try {
        console.log('기본 카메라로 재시도...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });
        
        setCameraStream(stream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        
        setError(''); // 에러 메시지 클리어
        console.log('기본 카메라 스트림 시작 성공');
        
      } catch (fallbackErr) {
        console.error('기본 카메라도 실패:', fallbackErr);
        setError('모든 카메라 연결 시도 실패: ' + fallbackErr.message);
      }
    }
  };

  // 캔버스에 비디오 프레임 그리기
  const drawVideoFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // 카메라 정보 오버레이
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 300, 80);
      
      ctx.fillStyle = 'white';
      ctx.font = '14px Arial';
      ctx.fillText(`카메라 ID: ${selectedCameraId}`, 20, 30);
      ctx.fillText(`카메라 인덱스: ${selectedCameraIndex}`, 20, 50);
      ctx.fillText(`해상도: ${canvas.width}x${canvas.height}`, 20, 70);
    }
  };

  // 비디오 프레임 업데이트
  useEffect(() => {
    let animationId;
    
    const updateFrame = () => {
      drawVideoFrame();
      animationId = requestAnimationFrame(updateFrame);
    };
    
    if (cameraStream && videoRef.current) {
      updateFrame();
    }
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [cameraStream, selectedCameraId, selectedCameraIndex]);

  // 컴포넌트 언마운트 시 스트림 정리
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h2>카메라 ID 테스트</h2>
      
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
            cursor: isLoading ? 'not-allowed' : 'pointer'
          }}
        >
          {isLoading ? '로딩 중...' : '카메라 ID 목록 가져오기'}
        </button>
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
          <h3>연결된 카메라 목록:</h3>
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
          <h3>카메라 스트림 (ID: {selectedCameraId})</h3>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* 숨겨진 비디오 요소 */}
            <video
              ref={videoRef}
              autoPlay
              muted
              style={{ display: 'none' }}
              onLoadedMetadata={() => {
                console.log('비디오 메타데이터 로드됨');
              }}
            />
            
            {/* 캔버스로 비디오 표시 */}
            <canvas
              ref={canvasRef}
              style={{
                border: '2px solid #007bff',
                borderRadius: '5px',
                maxWidth: '100%',
                height: 'auto'
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
        <h4>사용법:</h4>
        <ol>
          <li>"카메라 ID 목록 가져오기" 버튼을 클릭하여 연결된 카메라들의 ID를 확인합니다.</li>
          <li>원하는 카메라의 "이 카메라로 연결" 버튼을 클릭합니다.</li>
          <li>해당 카메라의 스트림이 캔버스에 표시됩니다.</li>
          <li>캔버스 위에 카메라 ID, 인덱스, 해상도 정보가 오버레이됩니다.</li>
        </ol>
        <p><strong>주의:</strong> 이 기능을 사용하려면 백엔드에 카메라 ID 관련 API가 구현되어 있어야 합니다.</p>
      </div>
    </div>
  );
};

export default CameraIdTest;
