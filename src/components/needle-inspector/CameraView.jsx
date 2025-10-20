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

  // 카메라 이미지 + 캔버스 오버레이 + 시간 텍스트를 포함한 이미지 캡처
  const captureImage = async (judgeResult = null, eepromData = null, resistanceData = null) => {
    // eepromData와 resistanceData의 실제 구조를 확인하기 위한 로그
    console.log(`[CameraView] captureImage called with:`, { judgeResult, eepromData, resistanceData });

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

      // 2. 캔버스 오버레이(선들) 그리기 - object-fit: cover 보정
      const overlayWidth = overlayCanvas.width;
      const overlayHeight = overlayCanvas.height;
      
      console.log(`🔍 [CRITICAL DEBUG] 오버레이 매핑 분석:`);
      console.log(`   - 오버레이 캔버스: ${overlayWidth} x ${overlayHeight}`);
      console.log(`   - 캡처용 캔버스: ${captureCanvas.width} x ${captureCanvas.height}`);
      
      // object-fit: cover로 인한 실제 이미지 표시 영역 계산
      const imgAspect = naturalWidth / naturalHeight;
      const containerAspect = displayWidth / displayHeight;
      
      console.log(`   - 이미지 비율: ${imgAspect.toFixed(4)}`);
      console.log(`   - 컨테이너 비율: ${containerAspect.toFixed(4)}`);
      
      // object-fit: cover 동작 분석
      let actualImageWidth, actualImageHeight;
      let imageOffsetX = 0, imageOffsetY = 0;
      
      if (imgAspect > containerAspect) {
        // 이미지가 더 넓음 → 좌우가 잘림
        actualImageHeight = displayHeight;
        actualImageWidth = displayHeight * imgAspect;
        imageOffsetX = (actualImageWidth - displayWidth) / 2;
        console.log(`   - 좌우 잘림: 실제 너비 ${actualImageWidth}, 오프셋 X: ${imageOffsetX}`);
      } else {
        // 이미지가 더 높음 → 상하가 잘림
        actualImageWidth = displayWidth;
        actualImageHeight = displayWidth / imgAspect;
        imageOffsetY = (actualImageHeight - displayHeight) / 2;
        console.log(`   - 상하 잘림: 실제 높이 ${actualImageHeight}, 오프셋 Y: ${imageOffsetY}`);
      }
      
      // 오버레이 캔버스가 컨테이너 크기와 일치하는지 확인
      if (overlayWidth === displayWidth && overlayHeight === displayHeight) {
        console.log(`✅ 오버레이와 컨테이너 크기 일치 - 직접 복사`);
        ctx.drawImage(overlayCanvas, 0, 0);
      } else {
        console.log(`⚠️ 크기 불일치 - 비율 조정 필요`);
        console.log(`   - 스케일 X: ${displayWidth / overlayWidth}`);
        console.log(`   - 스케일 Y: ${displayHeight / overlayHeight}`);
        
        ctx.drawImage(
          overlayCanvas, 
          0, 0, overlayWidth, overlayHeight,
          0, 0, displayWidth, displayHeight
        );
      }

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
          if (workStatus === 'needle_short') {
            // 니들 쇼트 시: EEPROM 정보 + 니들 쇼트 표시
            eepromText = `EEPROM      TIP:${eepromData.tipType}      SHOT:${eepromData.shotCount}      DATE:${eepromData.year}-${String(eepromData.month).padStart(2, '0')}-${String(eepromData.day).padStart(2, '0')}      MAKER:${eepromData.makerCode}      니들 쇼트      ${judgeResult}`;
          } else {
            // 정상 시: 기존 방식
            eepromText = `EEPROM      TIP:${eepromData.tipType}      SHOT:${eepromData.shotCount}      DATE:${eepromData.year}-${String(eepromData.month).padStart(2, '0')}-${String(eepromData.day).padStart(2, '0')}      MAKER:${eepromData.makerCode}      ${judgeResult}`;
          }
        } else {
          // EEPROM 데이터가 없는 경우 - workStatus에 따라 메시지 구분
          if (workStatus === 'needle_short') {
            eepromText = `니들 쇼트 ${judgeResult}`;
          } else {
            eepromText = `EEPROM 데이터 읽기 실패 ${judgeResult}`;
          }
        }
        
        // 저항 데이터가 있는 경우 추가
        if (resistanceData && (resistanceData.resistance1 !== undefined || resistanceData.resistance2 !== undefined)) {
          const r1 = isNaN(resistanceData.resistance1) ? 'NaN' : (0.001 * resistanceData.resistance1).toFixed(3);
          const r2 = isNaN(resistanceData.resistance2) ? 'NaN' : (0.001 * resistanceData.resistance2).toFixed(3);
          eepromText += `      R1:${r1}Ω      R2:${r2}Ω`;
        }
        
        console.log(`🎨 EEPROM 텍스트 그리기: ${eepromText}`);
        
        // 텍스트 크기 측정 (저항 정보가 추가되어 더 길어질 수 있음)
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
        
        console.log(`✅ EEPROM 및 저항 텍스트 그리기 완료`);
      } else {
        console.log(`❌ 판정 결과 없음: judgeResult=${judgeResult}`);
      }
      
      // 카메라 제목과 시간 텍스트를 오른쪽 하단에 표시
      ctx.font = "bold 16px Arial";
      ctx.fillStyle = "yellow";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      
      // 카메라 제목 오른쪽 하단 위치 계산
      const titleMetrics = ctx.measureText(title);
      const titleX = captureCanvas.width - titleMetrics.width - 10; // 오른쪽 여백 10px
      const titleY = captureCanvas.height - 40; // 하단에서 40px 위
      
      ctx.strokeText(title, titleX, titleY);
      ctx.fillText(title, titleX, titleY);
      
      // 시간 텍스트 오른쪽 하단 위치 계산
      const timeMetrics = ctx.measureText(timeText);
      const timeX = captureCanvas.width - timeMetrics.width - 10; // 오른쪽 여백 10px
      const timeY = captureCanvas.height - 20; // 하단에서 20px 위
      
      ctx.strokeText(timeText, timeX, timeY);
      ctx.fillText(timeText, timeX, timeY);

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
