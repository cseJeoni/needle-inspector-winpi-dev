import React from 'react';

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
    <div className="bg-[#3B3E46] rounded-lg p-3 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 bg-[#0CB56C] rounded-full"></span>
          <h2 className="text-sm text-gray-600">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onDrawModeToggle}
            className={`px-3 py-1 text-xs rounded ${
              drawMode 
                ? 'bg-orange-500 text-white' 
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {drawMode ? '취소' : '선 추가'}
          </button>
          <button 
            onClick={onDeleteLine} 
            disabled={selectedIndex === -1}
            className={`px-3 py-1 text-xs rounded ${
              selectedIndex === -1 
                ? 'bg-gray-500 text-gray-300 cursor-not-allowed' 
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            선 삭제
          </button>
        </div>
      </div>
      <div className="text-xs text-gray-400 mb-2">{lineInfo}</div>
      <div 
        id={`camera-feed-${cameraId}`} 
        ref={videoContainerRef} 
        className="bg-[#171C26] flex-1 rounded-md relative overflow-hidden"
        style={{ minHeight: '300px' }}
      >
        {videoServerUrl && videoEndpoint && (
          <img 
            src={`${videoServerUrl}${videoEndpoint}`} 
            alt={title} 
            className="w-full h-full object-cover" 
            style={{ position: 'absolute', top: 0, left: 0 }}
          />
        )}
        <canvas 
          ref={canvasRef} 
          className="absolute top-0 left-0 w-full h-full cursor-crosshair" 
          onMouseDown={handlers?.handleMouseDown} 
          onMouseMove={handlers?.handleMouseMove} 
          onMouseUp={handlers?.handleMouseUp}
          style={{ zIndex: 10 }}
        />
      </div>
    </div>
  )
}
