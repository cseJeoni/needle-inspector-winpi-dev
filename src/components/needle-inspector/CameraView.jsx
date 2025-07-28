import React from 'react';
import './CameraView.css';

/**
 * CameraView 컴포넌트 - NeedleInspector용 개별 카메라 뷰와 컨트롤을 담당
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {string} props.title - 카메라 제목
 * @param {number} props.cameraId - 카메라 ID (1 또는 2)
 * @param {string} props.videoServerUrl - 비디오 서버 URL
 * @param {string} props.videoEndpoint - 비디오 엔드포인트 (예: '/video', '/video2')
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
export default function CameraView({ 
  title, 
  cameraId, 
  videoServerUrl, 
  videoEndpoint, 
  drawMode, 
  onDrawModeToggle, 
  onDeleteLine, 
  selectedIndex, 
  lineInfo, 
  handlers, 
  canvasRef, 
  videoContainerRef 
}) {
  return (
    <div className="camera-view">
      <div className="camera-header">
        <div className="camera-title-container">
          <span className="camera-status"></span>
          <h2 className="camera-title">{title}</h2>
        </div>
        <div className="controls-container">
          <button 
            onClick={onDrawModeToggle}
            className={`control-button draw-button ${drawMode ? 'active' : ''}`}
            style={{ color: '#000000' }}
          >
            {drawMode ? '취소' : '선 추가'}
          </button>
          <button 
            onClick={onDeleteLine} 
            disabled={selectedIndex === -1}
            className={`control-button delete-button`}
            style={{ color: selectedIndex === -1 ? '#D1D5DB' : '#000000' }}
          >
            선 삭제
          </button>
        </div>
      </div>
      <div className="line-info">{lineInfo}</div>
      <div 
        id={`camera-feed-${cameraId}`} 
        ref={videoContainerRef} 
        className="camera-feed-container"
      >
        {videoServerUrl && videoEndpoint && (
          <img 
            src={`${videoServerUrl}${videoEndpoint}`} 
            alt={title} 
            className="camera-image"
          />
        )}
        <canvas 
          ref={canvasRef} 
          className="camera-canvas"
          onMouseDown={handlers?.handleMouseDown} 
          onMouseMove={handlers?.handleMouseMove} 
          onMouseUp={handlers?.handleMouseUp}
        />
      </div>
    </div>
  )
}
