import React, { useRef, useEffect, useState } from 'react';
import CameraView from './CameraView';

/**
 * CameraFeeds 컴포넌트 - 두 개의 CameraView를 관리하는 컨테이너
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {string} props.videoServerUrl - 비디오 서버 URL
 * @param {string} props.message - 메시지 상태
 * @returns {React.Component} React 컴포넌트
 */
const CameraFeeds = ({ videoServerUrl, message }) => {
  // Camera 1 상태
  const [drawMode1, setDrawMode1] = useState(false);
  const [selectedIndex1, setSelectedIndex1] = useState(-1);
  const [lineInfo1, setLineInfo1] = useState('');
  const canvasRef1 = useRef(null);
  const videoContainerRef1 = useRef(null);

  // Camera 2 상태
  const [drawMode2, setDrawMode2] = useState(false);
  const [selectedIndex2, setSelectedIndex2] = useState(-1);
  const [lineInfo2, setLineInfo2] = useState('');
  const canvasRef2 = useRef(null);
  const videoContainerRef2 = useRef(null);

  // 공통 상태
  const [lines1, setLines1] = useState([]);
  const [lines2, setLines2] = useState([]);
  const [isDrawing1, setIsDrawing1] = useState(false);
  const [isDrawing2, setIsDrawing2] = useState(false);
  const [startPoint1, setStartPoint1] = useState(null);
  const [startPoint2, setStartPoint2] = useState(null);

  // Camera 1 핸들러들
  const handlers1 = {
    handleMouseDown: (e) => {
      if (!drawMode1) return;
      const rect = canvasRef1.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setStartPoint1({ x, y });
      setIsDrawing1(true);
    },
    handleMouseMove: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return;
      const canvas = canvasRef1.current;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawLines(ctx, lines1);
      ctx.beginPath();
      ctx.moveTo(startPoint1.x, startPoint1.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    handleMouseUp: (e) => {
      if (!drawMode1 || !isDrawing1 || !startPoint1) return;
      const rect = canvasRef1.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const endPoint = { x, y };

      const newLine = { start: startPoint1, end: endPoint };
      const newLines = [...lines1, newLine];
      setLines1(newLines);
      
      setIsDrawing1(false);
      setStartPoint1(null);
      setDrawMode1(false);
      
      const distance = Math.sqrt(Math.pow(endPoint.x - startPoint1.x, 2) + Math.pow(endPoint.y - startPoint1.y, 2));
      setLineInfo1(`선 ${newLines.length}: ${distance.toFixed(2)}px`);
    },
    handleDeleteLine: () => {
      if (selectedIndex1 >= 0 && selectedIndex1 < lines1.length) {
        const newLines = lines1.filter((_, index) => index !== selectedIndex1);
        setLines1(newLines);
        setSelectedIndex1(-1);
        setLineInfo1('');
        const canvas = canvasRef1.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawLines(ctx, newLines);
      }
    }
  };

  // Camera 2 핸들러들
  const handlers2 = {
    handleMouseDown: (e) => {
      if (!drawMode2) return;
      const rect = canvasRef2.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setStartPoint2({ x, y });
      setIsDrawing2(true);
    },
    handleMouseMove: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return;
      const canvas = canvasRef2.current;
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawLines(ctx, lines2);
      ctx.beginPath();
      ctx.moveTo(startPoint2.x, startPoint2.y);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
    },
    handleMouseUp: (e) => {
      if (!drawMode2 || !isDrawing2 || !startPoint2) return;
      const rect = canvasRef2.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const endPoint = { x, y };

      const newLine = { start: startPoint2, end: endPoint };
      const newLines = [...lines2, newLine];
      setLines2(newLines);
      
      setIsDrawing2(false);
      setStartPoint2(null);
      setDrawMode2(false);
      
      const distance = Math.sqrt(Math.pow(endPoint.x - startPoint2.x, 2) + Math.pow(endPoint.y - startPoint2.y, 2));
      setLineInfo2(`선 ${newLines.length}: ${distance.toFixed(2)}px`);
    },
    handleDeleteLine: () => {
      if (selectedIndex2 >= 0 && selectedIndex2 < lines2.length) {
        const newLines = lines2.filter((_, index) => index !== selectedIndex2);
        setLines2(newLines);
        setSelectedIndex2(-1);
        setLineInfo2('');
        const canvas = canvasRef2.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawLines(ctx, newLines);
      }
    }
  };

  // 선 그리기 헬퍼 함수
  const drawLines = (ctx, lines) => {
    lines.forEach((line, index) => {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.strokeStyle = index === selectedIndex1 || index === selectedIndex2 ? 'blue' : 'red';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  // 캔버스 리사이즈 함수
  const resizeCanvas = (canvas, container) => {
    if (canvas && container) {
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
    }
  };

  const resizeAll = () => {
    resizeCanvas(canvasRef1.current, videoContainerRef1.current);
    resizeCanvas(canvasRef2.current, videoContainerRef2.current);
    
    if (canvasRef1.current) {
      const ctx1 = canvasRef1.current.getContext('2d');
      drawLines(ctx1, lines1);
    }
    if (canvasRef2.current) {
      const ctx2 = canvasRef2.current.getContext('2d');
      drawLines(ctx2, lines2);
    }
  };

  useEffect(() => {
    const img1 = document.querySelector('#camera-feed-1 img');
    const img2 = document.querySelector('#camera-feed-2 img');

    window.addEventListener('resize', resizeAll);
    if (img1) img1.addEventListener('load', resizeAll);
    if (img2) img2.addEventListener('load', resizeAll);

    setTimeout(resizeAll, 100);

    return () => {
      window.removeEventListener('resize', resizeAll);
      if (img1) img1.removeEventListener('load', resizeAll);
      if (img2) img2.removeEventListener('load', resizeAll);
    };
  }, [lines1, lines2]);

  return (
    <div className="camera-feeds">
      <CameraView
        cameraId={1}
        videoServerUrl={videoServerUrl}
        videoEndpoint="/video"
        cameraName="Camera 1"
        drawMode={drawMode1}
        onDrawModeToggle={() => setDrawMode1(!drawMode1)}
        onDeleteLine={handlers1.handleDeleteLine}
        selectedIndex={selectedIndex1}
        lineInfo={lineInfo1}
        handlers={handlers1}
        canvasRef={canvasRef1}
        videoContainerRef={videoContainerRef1}
      />
      <CameraView
        cameraId={2}
        videoServerUrl={videoServerUrl}
        videoEndpoint="/video2"
        cameraName="Camera 2"
        drawMode={drawMode2}
        onDrawModeToggle={() => setDrawMode2(!drawMode2)}
        onDeleteLine={handlers2.handleDeleteLine}
        selectedIndex={selectedIndex2}
        lineInfo={lineInfo2}
        handlers={handlers2}
        canvasRef={canvasRef2}
        videoContainerRef={videoContainerRef2}
      />
      {message && <p className="message">{message}</p>}
    </div>
  );
};

export default CameraFeeds;
