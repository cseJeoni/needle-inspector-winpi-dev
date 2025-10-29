import React, { useImperativeHandle, forwardRef, useState, useEffect } from 'react';
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
  onDeleteAllLines,
  selectedIndex, 
  lineInfo, 
  handlers, 
  canvasRef, 
  videoContainerRef,
  calibrationValue,
  onCalibrationChange,
  selectedLineColor,
  onLineColorChange,
  workStatus = 'waiting' // 작업 상태 (니들 쇼트, 저장 실패 등)
}, ref) => {
  // LED 상태 관리 (작업 시 LED를 끄고 하므로 기본 OFF 상태)
  const [ledState, setLedState] = useState(false); // false: OFF, true: ON
  const [deviceIndex, setDeviceIndex] = useState(null); // 카메라 디바이스 인덱스
  const [cameraDevices, setCameraDevices] = useState([]);

  // 컴포넌트 마운트 시 카메라 디바이스 목록 가져오기
  useEffect(() => {
    const loadCameraDevices = async () => {
      try {
        if (window.electronAPI && window.electronAPI.getCameraDevices) {
          console.log(`[${title}] 카메라 디바이스 목록 로드 중...`);
          const result = await window.electronAPI.getCameraDevices();
          
          if (result.success) {
            setCameraDevices(result.devices || []);
            console.log(`[${title}] 카메라 디바이스 목록:`, result.devices);
            
            // cameraId에 따라 디바이스 인덱스 설정 (간단한 매핑)
            // 실제 환경에서는 더 정교한 매핑이 필요할 수 있습니다
            if (result.devices && result.devices.length > 0) {
              const targetIndex = Math.min(cameraId - 1, result.devices.length - 1);
              setDeviceIndex(targetIndex);
              console.log(`[${title}] 디바이스 인덱스 설정: ${targetIndex}`);
              
              // 컴포넌트 마운트 시 LED를 OFF로 설정
              setTimeout(async () => {
                try {
                  if (window.electronAPI && window.electronAPI.setCameraLED) {
                    const result = await window.electronAPI.setCameraLED(targetIndex, 0); // OFF
                    if (result.success) {
                      setLedState(false);
                      console.log(`[${title}] 초기 LED OFF 설정 완료`);
                    } else {
                      console.warn(`[${title}] 초기 LED OFF 설정 실패:`, result.error);
                    }
                  }
                } catch (error) {
                  console.error(`[${title}] 초기 LED 설정 오류:`, error);
                }
              }, 500); // 0.5초 후 실행
            }
          } else {
            console.warn(`[${title}] 카메라 디바이스 목록 로드 실패:`, result.error);
          }
        }
      } catch (error) {
        console.error(`[${title}] 카메라 디바이스 목록 로드 오류:`, error);
      }
    };

    loadCameraDevices();
  }, [cameraId, title]);

  // LED 토글 핸들러
  const handleLEDToggle = async () => {
    if (deviceIndex === null) {
      console.warn(`[${title}] 디바이스 인덱스가 설정되지 않음`);
      alert('카메라 디바이스를 찾을 수 없습니다.');
      return;
    }

    try {
      const newLedState = !ledState;
      console.log(`[${title}] LED 상태 변경 시도: ${ledState ? 'ON' : 'OFF'} -> ${newLedState ? 'ON' : 'OFF'}`);
      
      if (window.electronAPI && window.electronAPI.setCameraLED) {
        const result = await window.electronAPI.setCameraLED(deviceIndex, newLedState ? 1 : 0);
        
        if (result.success) {
          setLedState(newLedState);
          console.log(`[${title}] LED 상태 변경 성공:`, result.message);
        } else {
          console.error(`[${title}] LED 상태 변경 실패:`, result.error);
          alert(`LED 제어 실패: ${result.error}`);
        }
      }
    } catch (error) {
      console.error(`[${title}] LED 토글 오류:`, error);
      alert(`LED 제어 오류: ${error.message}`);
    }
  };

  // 카메라 이미지 + 캔버스 오버레이만 포함한 순수 이미지 캡처 (정보 오버레이 제거)
  const captureImage = async (judgeResult = null, eepromData = null, resistanceData = null) => {
    // 정보 오버레이가 필요한 경우에만 로그 출력
    if (judgeResult || eepromData || resistanceData) {
      console.log(`[CameraView] ${title} - 정보 오버레이 포함 캡처 요청`);
    } else {
      console.log(`[CameraView] ${title} - 순수 이미지 캡처 요청`);
    }

    try {
      console.log(`📸 ${title} 이미지 캡처 시작...`);
      
      const imgElement = videoContainerRef.current?.querySelector('.camera-image');
      const overlayCanvas = canvasRef.current;
      
      if (!imgElement || !overlayCanvas) {
        console.error('❌ 이미지 또는 캔버스 요소를 찾을 수 없음');
        return null;
      }

      // 캡처용 캔버스 생성 - 정밀한 크기 분석
      const captureCanvas = document.createElement("canvas");
      
      // 모든 크기 정보를 정확히 측정
      const displayWidth = imgElement.clientWidth;
      const displayHeight = imgElement.clientHeight;
      const naturalWidth = imgElement.naturalWidth;
      const naturalHeight = imgElement.naturalHeight;
      const offsetWidth = imgElement.offsetWidth;
      const offsetHeight = imgElement.offsetHeight;
      
      // 컨테이너 크기도 확인
      const containerWidth = videoContainerRef.current.clientWidth;
      const containerHeight = videoContainerRef.current.clientHeight;
      
      console.log(`🔍 [CRITICAL DEBUG] 이미지 크기 분석:`);
      console.log(`   - clientWidth/Height: ${displayWidth} x ${displayHeight}`);
      console.log(`   - naturalWidth/Height: ${naturalWidth} x ${naturalHeight}`);
      console.log(`   - offsetWidth/Height: ${offsetWidth} x ${offsetHeight}`);
      console.log(`   - 컨테이너 크기: ${containerWidth} x ${containerHeight}`);
      
      // 오버레이 캔버스 크기도 확인
      const overlayRect = overlayCanvas.getBoundingClientRect();
      console.log(`   - 오버레이 캔버스: ${overlayCanvas.width} x ${overlayCanvas.height}`);
      console.log(`   - 오버레이 실제 표시: ${overlayRect.width} x ${overlayRect.height}`);
      
      captureCanvas.width = displayWidth;
      captureCanvas.height = displayHeight;
      const ctx = captureCanvas.getContext("2d");

      // 1. 카메라 이미지 그리기 (object-fit: cover 시뮬레이션)
      try {
        await new Promise((resolve, reject) => {
          const tempImg = new Image();
          tempImg.crossOrigin = "anonymous";
          tempImg.onload = () => {
            // 캡처 캔버스 크기 (컨테이너 크기)
            const displayWidth = captureCanvas.width;
            const displayHeight = captureCanvas.height;

            // 원본 이미지 크기
            const naturalWidth = tempImg.naturalWidth;
            const naturalHeight = tempImg.naturalHeight;

            // object-fit: cover 계산
            const imgAspect = naturalWidth / naturalHeight;
            const containerAspect = displayWidth / displayHeight;
            
            let actualImageWidth, actualImageHeight;
            let imageOffsetX = 0, imageOffsetY = 0;
            
            if (imgAspect > containerAspect) {
              // 이미지가 더 넓음 → 좌우가 잘림 (높이 기준)
              actualImageHeight = displayHeight;
              actualImageWidth = displayHeight * imgAspect;
              imageOffsetX = (actualImageWidth - displayWidth) / 2;
            } else {
              // 이미지가 더 높음 → 상하가 잘림 (너비 기준)
              actualImageWidth = displayWidth;
              actualImageHeight = displayWidth / imgAspect;
              imageOffsetY = (actualImageHeight - displayHeight) / 2;
            }

            console.log(`🔍 [OBJECT-FIT COVER] 이미지 비율: ${imgAspect.toFixed(4)}, 컨테이너 비율: ${containerAspect.toFixed(4)}`);
            console.log(`🔍 [OBJECT-FIT COVER] 실제 크기: ${actualImageWidth} x ${actualImageHeight}, 오프셋: ${imageOffsetX}, ${imageOffsetY}`);

            // 9-argument drawImage를 사용하여 object-fit: cover를 정확히 시뮬레이션
            ctx.drawImage(
              tempImg,                      // 원본 이미지
              0, 0,                         // 소스 X, Y (원본 이미지의 0,0)
              naturalWidth, naturalHeight,  // 소스 Width, Height (원본 이미지 전체)
              -imageOffsetX, -imageOffsetY, // 대상 X, Y (캔버스에 그릴 위치, 잘림 효과)
              actualImageWidth,             // 대상 Width (스케일링된 너비)
              actualImageHeight             // 대상 Height (스케일링된 높이)
            );
            
            console.log('✅ 카메라 이미지 로딩 성공 (object-fit: cover 적용)');
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

      // 2. 캔버스 오버레이(선들) 그리기 - 이제 이미지와 완벽히 일치
      const overlayWidth = overlayCanvas.width;
      const overlayHeight = overlayCanvas.height;
      
      console.log(`🔍 [OVERLAY] 오버레이 매핑:`);
      console.log(`   - 오버레이 캔버스: ${overlayWidth} x ${overlayHeight}`);
      console.log(`   - 캡처용 캔버스: ${captureCanvas.width} x ${captureCanvas.height}`);
      
      // 이미지가 이제 object-fit: cover로 정확히 그려졌으므로 오버레이도 동일하게 매핑
      if (overlayWidth === captureCanvas.width && overlayHeight === captureCanvas.height) {
        console.log(`✅ 크기 일치 - 1:1 직접 복사`);
        ctx.drawImage(overlayCanvas, 0, 0);
      } else {
        console.log(`⚠️ 크기 불일치 - 스케일링 적용`);
        ctx.drawImage(
          overlayCanvas, 
          0, 0, overlayWidth, overlayHeight,
          0, 0, captureCanvas.width, captureCanvas.height
        );
      }

      // 3. 카메라 제목만 오른쪽 하단에 표시 (시간 정보는 상단 프레임에서 처리)
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "yellow";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      
      // 카메라 제목 오른쪽 하단 위치 계산
      const titleMetrics = ctx.measureText(title);
      const titleX = captureCanvas.width - titleMetrics.width - 10; // 오른쪽 여백 10px
      const titleY = captureCanvas.height - 20; // 하단에서 20px 위 (시간 제거로 위치 조정)
      
      ctx.strokeText(title, titleX, titleY);
      ctx.fillText(title, titleX, titleY);

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
          <div className="color-selection-container">
            <button 
              onClick={() => onLineColorChange('red')}
              className={`color-button red-button ${selectedLineColor === 'red' ? 'selected' : ''}`}
              title="빨간색 선"
            />
            <button 
              onClick={() => onLineColorChange('cyan')}
              className={`color-button cyan-button ${selectedLineColor === 'cyan' ? 'selected' : ''}`}
              title="민트색 선"
            />
          </div>
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
          <button 
            onClick={onDeleteAllLines}
            className={`control-button delete-button`}
            style={{ color: '#000000' }}
          >
            전체 삭제
          </button>
          <button 
            onClick={handleLEDToggle}
            className={`control-button led-button ${ledState ? 'led-on' : 'led-off'}`}
            style={{ 
              color: '#000000',
              backgroundColor: ledState ? '#FFD700' : '#9E9E9E', // 노란색(ON) / 회색(OFF)
              border: `2px solid ${ledState ? '#FFC107' : '#757575'}`,
              fontWeight: 'bold',
              minWidth: '50px'
            }}
            title={`카메라 LED ${ledState ? '켜짐' : '꺼짐'} - 클릭하여 ${ledState ? '끄기' : '켜기'}`}
          >
            LED
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
          id={`canvas-${cameraId}`}
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
