import React, { useState, useRef, useEffect, useCallback } from 'react';
import '../css/ControlPanel.css';

const VIDEO_SERVER_URL = `http://${window.location.hostname}:5000`;
const PX_TO_MM = 1 / 3.78; // 1px 당 mm

function ControlPanel() {
    const [message, setMessage] = useState('');
    const [ws, setWs] = useState(null);
    const [isWsConnected, setIsWsConnected] = useState(false);

    // --- 캔버스 1 상태 ---
    const canvasRef1 = useRef(null);
    const videoContainerRef1 = useRef(null);
    const [lines1, setLines1] = useState([]);
    const [drawMode1, setDrawMode1] = useState(false);
    const [drawing1, setDrawing1] = useState(false);
    const [startPos1, setStartPos1] = useState({ x: 0, y: 0 });
    const [selectedIndex1, setSelectedIndex1] = useState(-1);
    const [draggingIndex1, setDraggingIndex1] = useState(-1);
    const [draggingEndpoint1, setDraggingEndpoint1] = useState(null);
    const [lineInfo1, setLineInfo1] = useState('선 정보: 없음');

    // --- 캔버스 2 상태 ---
    const canvasRef2 = useRef(null);
    const videoContainerRef2 = useRef(null);
    const [lines2, setLines2] = useState([]);
    const [drawMode2, setDrawMode2] = useState(false);
    const [drawing2, setDrawing2] = useState(false);
    const [startPos2, setStartPos2] = useState({ x: 0, y: 0 });
    const [selectedIndex2, setSelectedIndex2] = useState(-1);
    const [draggingIndex2, setDraggingIndex2] = useState(-1);
    const [draggingEndpoint2, setDraggingEndpoint2] = useState(null);
    const [lineInfo2, setLineInfo2] = useState('선 정보: 없음');

    const getMousePos = (canvas, e) => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const drawLineWithInfo = useCallback((ctx, line, color, showText) => {
        const { x1, y1, x2, y2 } = line;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const mm = length * PX_TO_MM;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;

        if (showText) {
            ctx.fillStyle = color;
            ctx.font = '14px Arial';
            ctx.fillText(`${length.toFixed(1)}px`, (x1 + x2) / 2 + 5, (y1 + y2) / 2 - 5);
        }
        return { length: length.toFixed(1), mm: mm.toFixed(2), angle: angle.toFixed(2) };
    }, [PX_TO_MM]);

    const createCanvasHandlers = (states) => {
        const {
            canvasRef, lines, setLines, drawMode, setDrawMode,
            drawing, setDrawing, startPos, setStartPos,
            selectedIndex, setSelectedIndex, draggingIndex, setDraggingIndex,
            draggingEndpoint, setDraggingEndpoint, setLineInfo
        } = states;

        const redraw = (tempLine = null) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            lines.forEach((line, i) => {
                const isSelected = (i === selectedIndex || i === draggingIndex);
                drawLineWithInfo(ctx, line, isSelected ? 'cyan' : 'red', isSelected);
            });
            if (tempLine) {
                drawLineWithInfo(ctx, tempLine, 'orange', true);
            }
        };

        const handleMouseDown = (e) => {
            const pos = getMousePos(canvasRef.current, e);
            if (drawMode) {
                setDrawing(true);
                setStartPos(pos);
                return;
            }
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                const dist = Math.sqrt((pos.x - line.x1) ** 2 + (pos.y - line.y1) ** 2);
                if (dist < 10) {
                    setSelectedIndex(i);
                    setDraggingIndex(i);
                    setDraggingEndpoint('start');
                    return;
                } 
                const dist2 = Math.sqrt((pos.x - line.x2) ** 2 + (pos.y - line.y2) ** 2);
                if (dist2 < 10) {
                    setSelectedIndex(i);
                    setDraggingIndex(i);
                    setDraggingEndpoint('end');
                    return;
                }
            }
            setSelectedIndex(-1);
        };

        const handleMouseMove = (e) => {
            if (!drawing) return;
            const pos = getMousePos(canvasRef.current, e);
            let endX = pos.x;
            let endY = pos.y;

            const dx = endX - startPos.x;
            const dy = endY - startPos.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const snapThreshold = 5;

            if (Math.abs(angle) < snapThreshold || Math.abs(Math.abs(angle) - 180) < snapThreshold) {
                endY = startPos.y;
            } else if (Math.abs(Math.abs(angle) - 90) < snapThreshold) {
                endX = startPos.x;
            }

            redraw({ x1: startPos.x, y1: startPos.y, x2: endX, y2: endY });
        };

        const handleMouseUp = (e) => {
            if (!drawing) return;
            const pos = getMousePos(canvasRef.current, e);
            let endX = pos.x;
            let endY = pos.y;

            const dx = endX - startPos.x;
            const dy = endY - startPos.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const snapThreshold = 5;

            if (Math.abs(angle) < snapThreshold || Math.abs(Math.abs(angle) - 180) < snapThreshold) {
                endY = startPos.y;
            } else if (Math.abs(Math.abs(angle) - 90) < snapThreshold) {
                endX = startPos.x;
            }

            const newLine = { x1: startPos.x, y1: startPos.y, x2: endX, y2: endY };
            const newLines = [...lines, newLine];
            setLines(newLines);
            setDrawing(false);
            setDrawMode(false);
            setSelectedIndex(newLines.length - 1);
        };

        const handleDeleteLine = () => {
            if (selectedIndex !== -1) {
                setLines(lines.filter((_, index) => index !== selectedIndex));
                setSelectedIndex(-1);
            }
        };

        return { redraw, handleMouseDown, handleMouseMove, handleMouseUp, handleDeleteLine };
    };

    const handlers1 = createCanvasHandlers({ canvasRef: canvasRef1, lines: lines1, setLines: setLines1, drawMode: drawMode1, setDrawMode: setDrawMode1, drawing: drawing1, setDrawing: setDrawing1, startPos: startPos1, setStartPos: setStartPos1, selectedIndex: selectedIndex1, setSelectedIndex: setSelectedIndex1, draggingIndex: draggingIndex1, setDraggingIndex: setDraggingIndex1, draggingEndpoint: draggingEndpoint1, setDraggingEndpoint: setDraggingEndpoint1, setLineInfo: setLineInfo1 });
    const handlers2 = createCanvasHandlers({ canvasRef: canvasRef2, lines: lines2, setLines: setLines2, drawMode: drawMode2, setDrawMode: setDrawMode2, drawing: drawing2, setDrawing: setDrawing2, startPos: startPos2, setStartPos: setStartPos2, selectedIndex: selectedIndex2, setSelectedIndex: setSelectedIndex2, draggingIndex: draggingIndex2, setDraggingIndex: setDraggingIndex2, draggingEndpoint: draggingEndpoint2, setDraggingEndpoint: setDraggingEndpoint2, setLineInfo: setLineInfo2 });

    useEffect(() => { handlers1.redraw(); }, [lines1, selectedIndex1, handlers1]);
    useEffect(() => { handlers2.redraw(); }, [lines2, selectedIndex2, handlers2]);

    useEffect(() => {
        const resizeAll = () => {
            [canvasRef1, canvasRef2].forEach((ref, i) => {
                const canvas = ref.current;
                const container = document.getElementById(`camera-feed-${i + 1}`);
                if (canvas && container) {
                    const videoElement = container.querySelector('img');
                    if (videoElement) {
                        canvas.width = videoElement.clientWidth;
                        canvas.height = videoElement.clientHeight;
                    }
                }
            });
            handlers1.redraw();
            handlers2.redraw();
        };
        window.addEventListener('resize', resizeAll);
        const img1 = videoContainerRef1.current?.querySelector('img');
        if (img1) img1.addEventListener('load', resizeAll);

        resizeAll();

        return () => {
            window.removeEventListener('resize', resizeAll);
            if (img1) img1.removeEventListener('load', resizeAll);
        };
    }, [handlers1, handlers2]);

    return (
        <div className="control-panel">
            <div className="camera-feeds">
                <div className="camera-view">
                    <div className="camera-controls">
                        <button onClick={() => setDrawMode1(!drawMode1)}>{drawMode1 ? '취소' : '선 추가'}</button>
                        <button onClick={handlers1.handleDeleteLine} disabled={selectedIndex1 === -1}>선 삭제</button>
                        <span>{lineInfo1}</span>
                    </div>
                    <div id="camera-feed-1" ref={videoContainerRef1} className="camera-feed-container">
                        <img src={`${VIDEO_SERVER_URL}/video`} alt="Camera 1" className="camera-image" />
                        <canvas ref={canvasRef1} className="camera-canvas" onMouseDown={handlers1.handleMouseDown} onMouseMove={handlers1.handleMouseMove} onMouseUp={handlers1.handleMouseUp} />
                    </div>
                </div>
                <div className="camera-view">
                    <div className="camera-controls">
                        <button onClick={() => setDrawMode2(!drawMode2)}>{drawMode2 ? '취소' : '선 추가'}</button>
                        <button onClick={handlers2.handleDeleteLine} disabled={selectedIndex2 === -1}>선 삭제</button>
                        <span>{lineInfo2}</span>
                    </div>
                    <div id="camera-feed-2" ref={videoContainerRef2} className="camera-feed-container">
                        <img src={`${VIDEO_SERVER_URL}/video2`} alt="Camera 2" className="camera-image" />
                        <canvas ref={canvasRef2} className="camera-canvas" onMouseDown={handlers2.handleMouseDown} onMouseMove={handlers2.handleMouseMove} onMouseUp={handlers2.handleMouseUp} />
                    </div>
                </div>
            </div>
            {message && <p className="message">{message}</p>}
        </div>
    );
}

export default ControlPanel;
