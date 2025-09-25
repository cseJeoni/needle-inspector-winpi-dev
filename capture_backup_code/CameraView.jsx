import React, { useImperativeHandle, forwardRef } from 'react';
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
const CameraView = forwardRef(({ 
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
  videoContainerRef,
  calibrationValue,
  onCalibrationChange
}, ref) => {

  // 카메라 이미지 + 캔버스 오버레이 + 시간 텍스트를 포함한 이미지 캡처
  const captureImage = async (judgeResult = null, eepromData = null) => {
    // eepromData의 실제 구조를 확인하기 위한 로그
    console.log(`[CameraView] captureImage called with:`, { judgeResult, eepromData });

    try {
      console.log(`📸 ${title} 이미지 캡처 시작...`);
      
      const imgElement = videoContainerRef.current?.querySelector('.camera-image');
      const overlayCanvas = canvasRef.current;
      
      if (!imgElement || !overlayCanvas) {
        console.error('❌ 이미지 또는 캔버스 요소를 찾을 수 없음');
        return null;
      }

      // 캡처용 캔버스 생성
      const captureCanvas = document.createElement("canvas");
      const containerRect = videoContainerRef.current.getBoundingClientRect();
      captureCanvas.width = containerRect.width || 640;
      captureCanvas.height = containerRect.height || 480;
      const ctx = captureCanvas.getContext("2d");

      // 1. 카메라 이미지 그리기
      try {
        await new Promise((resolve, reject) => {
          const tempImg = new Image();
          tempImg.crossOrigin = "anonymous";
          tempImg.onload = () => {
            ctx.drawImage(tempImg, 0, 0, captureCanvas.width, captureCanvas.height);
            console.log('✅ 카메라 이미지 로딩 성공');
            resolve();
          };
          tempImg.onerror = (error) => {
            console.error('❌ 카메라 이미지 로딩 실패:', error);
            // 카메라 이미지 로딩 실패 시 검은색 배경으로 대체
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
            console.log('🔄 검은색 배경으로 대체');
            resolve();
          };
          tempImg.src = imgElement.src;
        });
      } catch (error) {
        console.error('❌ 카메라 이미지 처리 중 오류:', error);
        // 에러 발생 시 검은색 배경으로 대체
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
      }

      // 2. 캔버스 오버레이(선들) 그리기
      ctx.drawImage(overlayCanvas, 0, 0);

      // 3. 텍스트 정보 추가
      const now = new Date();
      const timeText = now.toLocaleString();
      
      // 텍스트 스타일 설정
      ctx.font = "bold 20px Arial";
      ctx.lineWidth = 2;
      
      const textX = 10;
      let currentY = 30;
      
      // EEPROM 정보와 판정 결과 표시 (최상단)
      if (judgeResult) {
        let eepromText;
        
        if (eepromData) {
          // EEPROM 데이터가 있는 경우
          eepromText = `EEPROM      TIP:${eepromData.tipType}      SHOT:${eepromData.shotCount}      DATE:${eepromData.year}-${String(eepromData.month).padStart(2, '0')}-${String(eepromData.day).padStart(2, '0')}      MAKER:${eepromData.makerCode}      ${judgeResult}`;
        } else {
          // EEPROM 데이터가 없는 경우
          eepromText = `EEPROM 데이터 읽기 실패 ${judgeResult}`;
        }
        
        console.log(`🎨 EEPROM 텍스트 그리기: ${eepromText}`);
        
        // 텍스트 크기 측정
        const textMetrics = ctx.measureText(eepromText);
        const textWidth = textMetrics.width;
        const textHeight = 25;
        
        
        // 판정 결과에 따른 색상 설정
        if (judgeResult === 'PASS') {
          ctx.fillStyle = "lime";
          ctx.strokeStyle = "darkgreen";
        } else if (judgeResult === 'NG') {
          ctx.fillStyle = "red";
          ctx.strokeStyle = "darkred";
        } else {
          ctx.fillStyle = "yellow";
          ctx.strokeStyle = "black";
        }
        
        // 텍스트 그리기 (테두리 + 채우기)
        ctx.strokeText(eepromText, textX, currentY);
        ctx.fillText(eepromText, textX, currentY);
        currentY += 35;
        
        console.log(`✅ EEPROM 텍스트 그리기 완료`);
      } else {
        console.log(`❌ 판정 결과 없음: judgeResult=${judgeResult}`);
      }
      
      // 카메라 제목 (EEPROM 정보 아래)
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "yellow";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      
      ctx.strokeText(title, textX, currentY);
      ctx.fillText(title, textX, currentY);
      currentY += 20;
      
      // 시간 텍스트 (카메라 제목 아래)
      ctx.strokeText(timeText, textX, currentY);
      ctx.fillText(timeText, textX, currentY);

      // 4. 이미지 데이터 반환 (저장은 호출하는 쪽에서 처리)
      const dataURL = captureCanvas.toDataURL("image/png");
      console.log(`✅ ${title} 이미지 캡처 완료`);
      
      return dataURL;
      
    } catch (error) {
      console.error(`❌ ${title} 이미지 캡처 실패:`, error);
      return null;
    }
  };

  // ref를 통해 captureImage 함수를 외부에 노출
  useImperativeHandle(ref, () => ({
    captureImage,
    getTitle: () => title, // title 값을 반환하는 함수 추가
  }));

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
          <div className="calibration-container">
            <label className="calibration-label">스케일 (px/mm):</label>
            <input 
              type="number"
              step="0.01"
              min="0.1"
              max="100"
              value={calibrationValue}
              onChange={(e) => onCalibrationChange(parseFloat(e.target.value) || 19.8)}
              className="calibration-input"
              placeholder="19.8"
            />
          </div>
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
});

CameraView.displayName = 'CameraView';

export default CameraView;
