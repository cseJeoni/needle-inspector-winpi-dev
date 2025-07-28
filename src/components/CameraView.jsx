import React from 'react';

/**
 * CameraView 컴포넌트 - 개별 카메라 뷰와 컨트롤을 담당
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {number} props.cameraId - 카메라 ID (1 또는 2)
 * @param {string} props.videoServerUrl - 비디오 서버 URL
 * @param {string} props.videoEndpoint - 비디오 엔드포인트 (예: '/video', '/video2')
 * @param {string} props.cameraName - 카메라 이름 (예: 'Camera 1', 'Camera 2')
 * @param {boolean} props.drawMode - 그리기 모드 상태
 * @param {Function} props.onDrawModeToggle - 그리기 모드 토글 함수
 * @param {Function} props.onDeleteLine - 선 삭제 핸들러
 * @param {number} props.selectedIndex - 선택된 인덱스
 * @param {string} props.lineInfo - 선 정보 텍스트
 * @param {Object} props.handlers - 마우스 이벤트 핸들러들
 * @param {Object} props.canvasRef - 캔버스 ref
 * @param {Object} props.videoContainerRef - 비디오 컨테이너 ref
 * @returns {React.Component} React 컴포넌트
 */
const CameraView = ({
  cameraId,
  videoServerUrl,
  videoEndpoint,
  cameraName,
  drawMode,
  onDrawModeToggle,
  onDeleteLine,
  selectedIndex,
  lineInfo,
  handlers,
  canvasRef,
  videoContainerRef
}) => {
  return (
    <div className="camera-view">
      <div className="camera-controls">
        <button onClick={onDrawModeToggle}>
          {drawMode ? '취소' : '선 추가'}
        </button>
        <button onClick={onDeleteLine} disabled={selectedIndex === -1}>
          선 삭제
        </button>
        <span>{lineInfo}</span>
      </div>
      <div 
        id={`camera-feed-${cameraId}`} 
        ref={videoContainerRef} 
        className="camera-feed-container"
      >
        <img 
          src={`${videoServerUrl}${videoEndpoint}`} 
          alt={cameraName} 
          className="camera-image" 
        />
        <canvas 
          ref={canvasRef} 
          className="camera-canvas" 
          onMouseDown={handlers.handleMouseDown} 
          onMouseMove={handlers.handleMouseMove} 
          onMouseUp={handlers.handleMouseUp} 
        />
      </div>
    </div>
  );
};

export default CameraView;
