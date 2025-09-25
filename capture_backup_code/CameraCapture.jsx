import React, { useEffect, useRef, useState } from "react";

const CameraCapture = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [stream, setStream] = useState(null);

  // 카메라 연결
  useEffect(() => {
    const initCamera = async () => {
      try {
        console.log('카메라 초기화 중...');
        
        // 카메라 장치 목록 조회
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        console.log('사용 가능한 카메라:', videoDevices.length);
        
        // 카메라 인덱스 2번 사용
        const cameraIndex = 2;
        if (videoDevices.length <= cameraIndex) {
          console.error(`❌ 카메라 인덱스 ${cameraIndex}번을 찾을 수 없습니다. 사용 가능한 카메라는 ${videoDevices.length}개 입니다.`);
          // 여기에 사용자에게 알림을 보내는 로직을 추가할 수 있습니다.
          return; // 카메라 초기화 중단
        }
        const deviceId = videoDevices[cameraIndex].deviceId;
        console.log(`선택된 카메라 ID (인덱스 ${cameraIndex}):`, deviceId);
        
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            deviceId: { exact: deviceId },
            width: 640, 
            height: 480
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          setStream(mediaStream);
          console.log(`✅ 카메라 연결 성공 (인덱스 ${cameraIndex}번)`);
        }
      } catch (error) {
        console.error('카메라 연결 실패:', error);
      }
    };

    initCamera();

    // 컴포넌트 언마운트 시 스트림 정리
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // 비디오 준비 완료 시 오버레이 그리기
  const handleVideoCanPlay = () => {
    setIsVideoReady(true);
    drawOverlay();
  };

  // 테스트용 선/텍스트 그리기
  const drawOverlay = () => {
    if (!canvasRef.current) return;
    
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // 십자선 그리기
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.beginPath();
    // 수직선
    ctx.moveTo(320, 0);
    ctx.lineTo(320, 480);
    // 수평선
    ctx.moveTo(0, 240);
    ctx.lineTo(640, 240);
    ctx.stroke();

    // 모서리 마커
    ctx.strokeStyle = "lime";
    ctx.lineWidth = 3;
    const markerSize = 20;
    
    // 좌상단
    ctx.beginPath();
    ctx.moveTo(50, 50);
    ctx.lineTo(50 + markerSize, 50);
    ctx.moveTo(50, 50);
    ctx.lineTo(50, 50 + markerSize);
    ctx.stroke();
    
    // 우상단
    ctx.beginPath();
    ctx.moveTo(590, 50);
    ctx.lineTo(590 - markerSize, 50);
    ctx.moveTo(590, 50);
    ctx.lineTo(590, 50 + markerSize);
    ctx.stroke();
    
    // 좌하단
    ctx.beginPath();
    ctx.moveTo(50, 430);
    ctx.lineTo(50 + markerSize, 430);
    ctx.moveTo(50, 430);
    ctx.lineTo(50, 430 - markerSize);
    ctx.stroke();
    
    // 우하단
    ctx.beginPath();
    ctx.moveTo(590, 430);
    ctx.lineTo(590 - markerSize, 430);
    ctx.moveTo(590, 430);
    ctx.lineTo(590, 430 - markerSize);
    ctx.stroke();

    // 텍스트 오버레이
    ctx.fillStyle = "yellow";
    ctx.font = "bold 16px Arial";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    
    const text = "Camera + Overlay";
    ctx.strokeText(text, 10, 30);
    ctx.fillText(text, 10, 30);
    
    // 시간 표시
    const now = new Date();
    const timeText = now.toLocaleTimeString();
    ctx.strokeText(timeText, 10, 460);
    ctx.fillText(timeText, 10, 460);
  };

  // 선 + 텍스트 그리고, 이미지로 저장
  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current || !isVideoReady) {
      console.error('비디오 또는 캔버스가 준비되지 않음');
      return;
    }

    try {
      console.log('이미지 캡처 시작...');
      
      const video = videoRef.current;
      const overlayCanvas = canvasRef.current;

      // 캡처용 캔버스 생성
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = video.videoWidth || 640;
      captureCanvas.height = video.videoHeight || 480;
      const ctx = captureCanvas.getContext("2d");

      // 1. 비디오 프레임 캡처
      ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);

      // 2. 오버레이(선/텍스트)도 같이 그림
      ctx.drawImage(overlayCanvas, 0, 0);

      // 3. 저장 (data URL → Electron에서 저장)
      const dataURL = captureCanvas.toDataURL("image/png");
      
      // Electron API 사용 가능한지 확인
      if (window.electronAPI && window.electronAPI.saveImage) {
        console.log('Electron API로 이미지 저장...');
        await window.electronAPI.saveImage(dataURL);
        console.log('이미지 저장 완료');
      } else {
        // Electron API가 없는 경우 fallback: 다운로드 링크 생성
        console.log('브라우저 다운로드로 이미지 저장...');
        const link = document.createElement('a');
        link.download = `camera_capture_${Date.now()}.png`;
        link.href = dataURL;
        link.click();
        console.log('이미지 다운로드 완료');
      }
      
    } catch (error) {
      console.error('이미지 캡처 실패:', error);
    }
  };

  // 오버레이 다시 그리기 (실시간 업데이트용)
  const refreshOverlay = () => {
    drawOverlay();
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Camera Capture with Overlay</h2>
      
      <div style={{ 
        position: "relative", 
        width: 640, 
        height: 480, 
        border: '2px solid #333',
        borderRadius: '8px',
        overflow: 'hidden',
        margin: '20px 0'
      }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          width="640"
          height="480"
          style={{ 
            position: "absolute", 
            top: 0, 
            left: 0,
            display: 'block'
          }}
          onCanPlay={handleVideoCanPlay}
        />
        <canvas
          ref={canvasRef}
          width="640"
          height="480"
          style={{ 
            position: "absolute", 
            top: 0, 
            left: 0, 
            pointerEvents: "none",
            zIndex: 1
          }}
        />
        
        {!isVideoReady && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: 2
          }}>
            카메라 로딩 중...
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button 
          onClick={captureImage}
          disabled={!isVideoReady}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isVideoReady ? '#4CAF50' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isVideoReady ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          이미지 저장
        </button>
        
        <button 
          onClick={refreshOverlay}
          disabled={!isVideoReady}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            backgroundColor: isVideoReady ? '#2196F3' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isVideoReady ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          오버레이 새로고침
        </button>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p>기능:</p>
        <ul>
          <li>실시간 웹캠 피드 표시</li>
          <li>십자선 및 모서리 마커 오버레이</li>
          <li>시간 표시</li>
          <li>비디오 + 오버레이 통합 이미지 캡처</li>
          <li>Electron API 또는 브라우저 다운로드로 PNG 저장</li>
        </ul>
      </div>
    </div>
  );
};

export default CameraCapture;