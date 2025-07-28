import React, { useState, useEffect } from 'react';
import CameraFeeds from './CameraFeeds';
import '../css/ControlPanel.css';

const VIDEO_SERVER_URL = 'http://localhost:5000';

// 모터 연결 기본 설정값
const MOTOR_CONFIG = {
  device: 'usb-motor',
  baudrate: 19200,
  parity: 'none',
  dataBits: 8,
  stopBits: 1
};

/**
 * ControlPanel 컴포넌트 - 카메라 모니터링 및 측정 기능을 제공
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - children에 대한 설명
 * @returns {React.Component} React 컴포넌트
 */
const ControlPanel = ({ children }) => {
    const [message, setMessage] = useState('');
    const [ws, setWs] = useState(null);
    const [isWsConnected, setIsWsConnected] = useState(false);
    const [isMotorConnected, setIsMotorConnected] = useState(false);
    const [motorError, setMotorError] = useState(null);
    const [currentPosition, setCurrentPosition] = useState(0);
    const [gpioState, setGpioState] = useState('LOW');
    const [gpioError, setGpioError] = useState(null);
    const [isGpioReading, setIsGpioReading] = useState(false);

    // WebSocket 연결 및 모터 자동 연결
    useEffect(() => {
        console.log(' 모터 WebSocket 연결 시도...');
        const socket = new WebSocket("ws://192.168.0.82:8765");

        socket.onopen = () => {
            console.log(" 모터 WebSocket 연결 성공");
            setIsWsConnected(true);
            setMotorError(null);
            
            // WebSocket 연결 후 자동으로 모터 연결 시도
            setTimeout(() => {
                connectMotor(socket);
            }, 1000);
        };

        socket.onclose = () => {
            console.log(" 모터 WebSocket 연결 끊김");
            setIsWsConnected(false);
            setIsMotorConnected(false);
            setMotorError("WebSocket 연결이 끊어졌습니다.");
        };

        socket.onerror = (err) => {
            console.error(" 모터 WebSocket 오류:", err);
            setMotorError("WebSocket 연결 오류가 발생했습니다.");
        };

        socket.onmessage = (e) => {
            try {
                const res = JSON.parse(e.data);
                console.log(" 모터 응답:", res);

                if (res.type === "serial") {
                    if (res.result.includes("성공") || 
                        res.result.includes("완료") || 
                        res.result.includes("전송 완료")) {
                        console.log(" 모터 연결 성공");
                        setIsMotorConnected(true);
                        setMotorError(null);
                    } else if (res.result.includes("실패") || 
                               res.result.includes("오류")) {
                        console.error(" 모터 연결 실패:", res.result);
                        setIsMotorConnected(false);
                        setMotorError(res.result);
                    }
                } else if (res.type === "status") {
                    // 상태 업데이트 (모터 + GPIO)
                    const { position, gpio18 } = res.data;
                    setCurrentPosition(position);
                    
                    // GPIO 상태 업데이트
                    if (gpio18 && gpio18 !== "UNKNOWN") {
                        setGpioState(gpio18);
                        setGpioError(null);
                        console.log("🔧 GPIO 상태 업데이트:", gpio18);
                    }
                    
                    console.log("📊 모터 위치 업데이트:", position, "GPIO 18:", gpio18);
                } else if (res.type === "gpio") {
                    // GPIO 상태 업데이트
                    console.log("✅ GPIO 상태 읽기 성공:", res.state);
                    setGpioState(res.state);
                    setGpioError(null);
                } else if (res.type === "error") {
                    console.error(" 모터 오류:", res.result);
                    setMotorError(res.result);
                }
            } catch (err) {
                console.error(" 모터 메시지 파싱 오류:", err);
            }
        };

        setWs(socket);

        // 컴포넌트 언마운트 시 정리
        return () => {
            if (socket.readyState === WebSocket.OPEN) {
                console.log(" 모터 포트 닫기 및 WebSocket 연결 종료...");
                // 먼저 모터 연결 해제
                socket.send(JSON.stringify({ cmd: "disconnect" }));
                // 잠시 후 WebSocket 연결 종료
                setTimeout(() => {
                    socket.close();
                    console.log(" 모터 연결 정리 완료");
                }, 500);
            }
        };
    }, []);

    // 모터 자동 연결 함수
    const connectMotor = (socket) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error(" WebSocket이 연결되지 않았습니다.");
            setMotorError("WebSocket이 연결되지 않았습니다.");
            return;
        }

        const msg = {
            cmd: "connect",
            port: MOTOR_CONFIG.device,
            baudrate: MOTOR_CONFIG.baudrate,
            parity: MOTOR_CONFIG.parity,
            databits: MOTOR_CONFIG.dataBits,
            stopbits: MOTOR_CONFIG.stopBits,
        };

        console.log(" 모터 자동 연결 시도:", msg);
        socket.send(JSON.stringify(msg));
    };

    // 앱 종료 시 정리 (window beforeunload 이벤트)
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                console.log(" 앱 종료 - 모터 포트 닫기...");
                ws.send(JSON.stringify({ cmd: "disconnect" }));
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [ws]);

    const handleServoMode = (value) => {
        setCurrentPosition(value);
        if (ws && ws.readyState === WebSocket.OPEN) {
            const msg = {
                cmd: "move",
                position: value,
                mode: "servo",
            };
            console.log(" 서보 모드 명령 전송:", msg);
            ws.send(JSON.stringify(msg));
        } else {
            console.error(" WebSocket이 연결되지 않았습니다.");
            setMotorError("WebSocket이 연결되지 않았습니다.");
        }
    };

    const handlePositionMode = (value) => {
        setCurrentPosition(value);
        if (ws && ws.readyState === WebSocket.OPEN) {
            const msg = {
                cmd: "move",
                position: value,
                mode: "position",
            };
            console.log(" 포지션 모드 명령 전송:", msg);
            ws.send(JSON.stringify(msg));
        } else {
            console.error(" WebSocket이 연결되지 않았습니다.");
            setMotorError("WebSocket이 연결되지 않았습니다.");
        }
    };

    const handleCustomValue = () => {
        const customInput = document.getElementById("custom-value");
        const value = parseInt(customInput.value);
        
        if (isNaN(value) || value < 0 || value > 2000) {
            setMotorError("0~2000 범위의 숫자를 입력해주세요.");
            return;
        }
        
        handlePositionMode(value);
        customInput.value = "";
    };

    const handleGpioRead = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const msg = {
                cmd: "gpio_read"
            };
            console.log("📤 GPIO 상태 읽기 명령 전송:", msg);
            ws.send(JSON.stringify(msg));
        } else {
            console.error("❌ WebSocket이 연결되지 않았습니다.");
            setGpioError("WebSocket이 연결되지 않았습니다.");
        }
    };

    // GPIO 상태는 이제 모터 상태와 함께 자동으로 전송되므로 별도 요청 불필요
    // useEffect(() => {
    //     const intervalId = setInterval(handleGpioRead, 1000);
    //     setIsGpioReading(true);
    //     
    //     return () => {
    //         clearInterval(intervalId);
    //         setIsGpioReading(false);
    //     };
    // }, []);

    return (
        <div className="control-panel">
            {/* 모터 연결 상태 표시 */}
            <div style={{ 
                position: 'absolute', 
                top: '10px', 
                right: '10px', 
                padding: '8px 12px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                backgroundColor: isMotorConnected ? '#d4edda' : '#f8d7da',
                color: isMotorConnected ? '#155724' : '#721c24',
                border: `1px solid ${isMotorConnected ? '#c3e6cb' : '#f5c6cb'}`
            }}>
                모터: {isMotorConnected ? '연결됨' : '연결 안됨'}
                {motorError && (
                    <div style={{ fontSize: '10px', marginTop: '2px', opacity: 0.8 }}>
                        {motorError}
                    </div>
                )}
            </div>

            <CameraFeeds 
                videoServerUrl={VIDEO_SERVER_URL}
                message={message}
            />

            {/* 서보 모드 컨트롤 */}
            <div style={{ 
                marginTop: '20px', 
                padding: '20px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '15px', 
                    marginBottom: '15px' 
                }}>
                    <label htmlFor="servo-mode" style={{ 
                        fontWeight: 'bold', 
                        fontSize: '14px',
                        minWidth: '80px'
                    }}>
                        서보 모드
                    </label>
                    <input
                        type="text"
                        id="servo-mode"
                        value={currentPosition}
                        readOnly
                        style={{
                            padding: '5px 10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            width: '80px',
                            textAlign: 'center',
                            backgroundColor: '#fff'
                        }}
                    />
                    <input
                        type="range"
                        id="servo-slider"
                        min={0}
                        max={2000}
                        step={1}
                        value={currentPosition}
                        onChange={(e) => handleServoMode(parseInt(e.target.value))}
                        style={{ flex: 1 }}
                    />
                </div>
                
                <div className="button-container" style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    {[0, 300, 500, 700, 1000, 1300, 1500, 1700, 2000].map((value) => (
                        <button
                            key={value}
                            className="number-button"
                            onClick={() => handlePositionMode(value)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                border: '1px solid #ccc',
                                backgroundColor: '#fff',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                minWidth: '50px'
                            }}
                        >
                            {value}
                        </button>
                    ))}
                    <input 
                        type="text" 
                        id="custom-value" 
                        placeholder="Custom"
                        style={{
                            padding: '6px 10px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            width: '80px'
                        }}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                                handleCustomValue();
                            }
                        }}
                    />
                    <button
                        id="confirm-button"
                        onClick={handleCustomValue}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            border: '1px solid #007bff',
                            backgroundColor: '#007bff',
                            color: 'white',
                            cursor: 'pointer',
                            borderRadius: '4px'
                        }}
                    >
                        확인
                    </button>
                </div>
            </div>

            {/* GPIO 18번 상태 표시 */}
            <div style={{ 
                marginTop: '20px', 
                padding: '20px', 
                backgroundColor: '#f8f9fa', 
                borderRadius: '8px',
                border: '1px solid #dee2e6'
            }}>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '15px', 
                    marginBottom: '15px' 
                }}>
                    <label style={{ 
                        fontWeight: 'bold', 
                        fontSize: '14px',
                        minWidth: '80px'
                    }}>
                        GPIO 18번 입력
                    </label>
                    <div style={{ 
                        padding: '8px 15px',
                        border: '2px solid #ccc',
                        borderRadius: '6px',
                        width: '100px',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        backgroundColor: gpioState === 'HIGH' ? '#d4edda' : '#f8d7da',
                        borderColor: gpioState === 'HIGH' ? '#28a745' : '#dc3545',
                        color: gpioState === 'HIGH' ? '#155724' : '#721c24'
                    }}>
                        {gpioState}
                    </div>
                    <div style={{
                        fontSize: '12px',
                        color: '#6c757d',
                        fontStyle: 'italic'
                    }}>
                        {gpioError ? `오류: ${gpioError}` : '실시간 모니터링 중...'}
                    </div>
                </div>
            </div>

            {children}
        </div>
    );
};

export default ControlPanel;
