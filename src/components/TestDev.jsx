import right_arrow from "../assets/icon/arrow_right.png";
import { useState, useEffect } from "react";
import "../css/styles.css";

function TestDev() {
  const [availablePorts, setAvailablePorts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [ws, setWs] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [motorStatus, setMotorStatus] = useState({
    force: 0,
    sensor: 0,
    setPos: 0,
    actPos: 0,
  });
  const [currentPosition, setCurrentPosition] = useState(0);
  const [speedValue, setSpeedValue] = useState(0);
  const [forceValue, setForceValue] = useState(0);

  useEffect(() => {
    // 시리얼 포트 목록을 가져오는 함수
    const getPorts = async () => {
      try {
        // 여기에 시리얼 포트 목록을 가져오는 로직을 구현해야 합니다
        // 예: window.electron.serial.getPorts()
        const ports = []; // 임시로 빈 배열 사용
        setAvailablePorts(ports);
      } catch (err) {
        setError("포트 목록을 가져오는데 실패했습니다.");
      }
    };

    getPorts();
  }, []);

  // WebSocket 연결 설정
  useEffect(() => {
    const socket = new WebSocket("ws://192.168.0.82:8765");

    socket.onopen = () => {
      console.log("✅ WebSocket 연결됨");
      setIsWsConnected(true);
      setError(null);
    };

    socket.onclose = () => {
      console.log("❌ WebSocket 연결 끊김");
      setIsWsConnected(false);
      setError("WebSocket 연결이 끊어졌습니다.");
    };

    socket.onerror = (err) => {
      console.error("WebSocket 오류:", err);
      setError("WebSocket 연결 오류가 발생했습니다.");
    };

    socket.onmessage = (e) => {
      try {
        const res = JSON.parse(e.data);
        console.log("📩 응답:", res);

        if (res.type === "serial") {
          if (
            res.result.includes("성공") ||
            res.result.includes("완료") ||
            res.result.includes("전송 완료")
          ) {
            setIsConnected(true);
            setError(null);
            // 모터 이동 명령에 대한 응답일 경우 상태 요청
            if (res.result.includes("명령 전송")) {
              console.log("🔄 모터 상태 요청");
              socket.send(JSON.stringify({ cmd: "status" }));
            }
          } else if (
            res.result.includes("실패") ||
            res.result.includes("오류")
          ) {
            setError(res.result);
          }
        } else if (res.type === "status") {
          // 상태 업데이트
          const { force, position, sensor, setPos } = res.data;
          console.log("📊 상태 업데이트:", { force, position, sensor, setPos });
          document.getElementById("Current_Status_force").textContent =
            force.toFixed(1);
          document.getElementById("Current_Status_setPos").textContent = setPos;
          document.getElementById("Current_Status_actPos").textContent =
            position;
          document.getElementById("Current_Status_sensor").textContent = sensor;
        } else if (res.type === "error") {
          setError(res.result);
        }
      } catch (err) {
        console.error("메시지 파싱 오류:", err);
      }
    };

    setWs(socket);

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, []); // 의존성 배열을 비워서 컴포넌트 마운트 시에만 실행되도록 수정

  const handleSerialConnect = () => {
    if (!isWsConnected) {
      setError("WebSocket이 연결되지 않았습니다.");
      return;
    }

    const port = document.querySelector("select[name='serialDevice']").value;
    const baudrate = document.querySelector("select[name='baudRate']").value;
    const parity = document.querySelector("select[name='parity']").value;
    const dataBits = document.querySelector("select[name='dataBits']").value;
    const stopBits = document.querySelector("select[name='stopBits']").value;

    const msg = {
      cmd: "connect",
      port,
      baudrate: parseInt(baudrate),
      parity,
      databits: parseInt(dataBits),
      stopbits: parseFloat(stopBits),
    };

    console.log("시리얼 포트 연결 요청:", msg);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  const handleSerialDisconnect = () => {
    if (!isWsConnected) {
      setError("WebSocket이 연결되지 않았습니다.");
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cmd: "disconnect" }));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 서보 모드 핸들러
  const handleServoMode = (value) => {
    setCurrentPosition(value);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        cmd: "move",
        position: value,
        mode: "servo",
      };
      console.log("📤 서보 모드 명령 전송:", msg);
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 포지션 모드 핸들러
  const handlePositionMode = (value) => {
    setCurrentPosition(value);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        cmd: "move",
        position: value,
        mode: "position",
      };
      console.log("📤 포지션 모드 명령 전송:", msg);
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 스피드 모드 핸들러
  const handleSpeedMode = () => {
    const speedInput = document.getElementById("speedmode-speed-input").value;
    const positionInput = document.getElementById(
      "speedmode-position-input"
    ).value;

    // 입력값 검증
    if (!speedInput || !positionInput) {
      setError("스피드와 목표 위치를 모두 입력해주세요.");
      return;
    }

    const speed = parseInt(speedInput);
    const position = parseInt(positionInput);

    // 숫자 변환 검증
    if (isNaN(speed) || isNaN(position)) {
      setError("유효한 숫자를 입력해주세요.");
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        cmd: "move",
        speed: speed,
        position: position,
        mode: "speed",
      };
      console.log("📤 스피드 모드 명령 전송:", msg);
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 스피드+힘 모드 핸들러
  const handleSpeedForceMode = (speed, position, force) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        cmd: "move",
        speed: speed,
        position: position,
        force: force,
        mode: "speed_force",
      };
      console.log("📤 스피드+힘 모드 명령 전송:", msg);
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 힘 모드 핸들러
  const handleForceMode = (force) => {
    setForceValue(force);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = {
        cmd: "move",
        force: force,
        mode: "force",
      };
      console.log("📤 힘 모드 명령 전송:", msg);
      ws.send(JSON.stringify(msg));
    } else {
      setError("WebSocket이 연결되지 않았습니다.");
    }
  };

  // 스피드+힘 모드 전송 핸들러
  const handleSpeedPowerSend = () => {
    const speed = parseInt(
      document.getElementById("speedpower-speed-input").value
    );
    const position = parseInt(
      document.getElementById("speedpower-position-input").value
    );
    const force = parseInt(
      document.getElementById("speedpower-force-input").value
    );
    handleSpeedForceMode(speed, position, force);
  };

  // 힘 모드 슬라이더 변경 핸들러
  const handleForceSliderChange = (e) => {
    const value = parseFloat(e.target.value);
    handleForceMode(value);
  };

  return (
    <div>
      <div className="container">
        <section className="Motor">
          <div className="Motor_title">
            <h1 className="title">MOTOR</h1>
            <div className="border_bottom" />
          </div>
          <div className="Motor_Port">
            <h6 className="second_text">PORT CONFIG</h6>
            <ul className="horizontality">
              <li className="left">
                <p>DEVICE</p>
              </li>
              <li className="right">
                <select name="serialDevice">
                  <option value="usb-motor">usb-motor</option>
                  <option value="usb-rf">usb-rf</option>
                </select>
              </li>
            </ul>
            <ul className="horizontality">
              <li className="left">
                <p>BAUDRATE</p>
              </li>
              <li className="right">
                <select name="baudRate">
                  <option value={19200}>19200</option>
                </select>
              </li>
            </ul>
            <ul className="horizontality">
              <li className="left">
                <p>PARITY</p>
              </li>
              <li className="right">
                <select name="parity">
                  <option value="none">None</option>
                  <option value="even">Even</option>
                  <option value="odd">Odd</option>
                  <option value="mark">Mark</option>
                </select>
              </li>
            </ul>
            <ul className="horizontality">
              <li className="left">
                <p>DATA BITS</p>
              </li>
              <li className="right">
                <select name="dataBits">
                  <option value={8}>8</option>
                  <option value={7}>7</option>
                  <option value={6}>6</option>
                  <option value={5}>5</option>
                </select>
              </li>
            </ul>
            <ul className="horizontality">
              <li className="left">
                <p>STOP BITS</p>
              </li>
              <li className="right">
                <select name="stopBits">
                  <option value={1}>1</option>
                  <option value={1.5}>1.5</option>
                  <option value={2}>2</option>
                </select>
              </li>
            </ul>
            <ul className="horizontality">
              <li className="left">
                <button className="btn_open" onClick={handleSerialConnect}>
                  OPEN PORT
                </button>
              </li>
              <li className="right">
                <button className="btn_close" onClick={handleSerialDisconnect}>
                  CLOSE PORT
                </button>
              </li>
            </ul>
            <div className="border_bottom" />
          </div>
          {/* 여기부터 현재상태 */}
          <div className="Motor_Port">
            <div className="horizontality">
              <ul>
                <li>
                  <h6 className="second_text">현재 상태</h6>
                </li>
              </ul>
              <ul className="horizontal_alignment">
                <li>
                  <p>FORCE/N</p>
                </li>
                <li>
                  <div
                    id="Current_Status_force"
                    className="Current_Status"
                  ></div>
                </li>
              </ul>
              <ul className="horizontal_alignment">
                <li>
                  <p>SENSOR</p>
                </li>
                <li>
                  <div
                    id="Current_Status_sensor"
                    className="Current_Status"
                  ></div>
                </li>
              </ul>
              <ul className="horizontal_alignment">
                <li>
                  <p>SETPOS</p>
                </li>
                <li>
                  <div
                    id="Current_Status_setPos"
                    className="Current_Status"
                  ></div>
                </li>
              </ul>
              <ul className="horizontal_alignment">
                <li>
                  <p>ACTPOS</p>
                </li>
                <li>
                  <div
                    id="Current_Status_actPos"
                    className="Current_Status"
                  ></div>
                </li>
              </ul>
            </div>
            <div className="border_bottom" />
          </div>
          {/* 여기부터 서보모드 */}
          <div className="Motor-port">
            <div className="Motor-port-div">
              <label htmlFor="servo-mode">서보 모드</label>
              <input
                type="text"
                id="servo-mode"
                className="current-status"
                value={currentPosition}
                readOnly
              />
              <input
                type="range"
                id="servo-slider"
                min={0}
                max={2000}
                step={1}
                value={currentPosition}
                onChange={(e) => handleServoMode(parseInt(e.target.value))}
              />
              <div className="button-container">
                {[0, 300, 500, 700, 1000, 1300, 1500, 1700, 2000].map(
                  (value) => (
                    <button
                      key={value}
                      className="number-button"
                      data-value={value}
                      onClick={(e) =>
                        handlePositionMode(parseInt(e.target.dataset.value))
                      }
                    >
                      {value}
                    </button>
                  )
                )}
                <input type="text" id="custom-value" placeholder="Custom" />
                <button
                  id="confirm-button"
                  onClick={() => {
                    const value = parseInt(
                      document.getElementById("custom-value").value
                    );
                    if (!isNaN(value)) {
                      handlePositionMode(value);
                    }
                  }}
                >
                  CONFIRM
                </button>
              </div>
            </div>
            <div className="border_bottom" />
          </div>
          {/* JavaScript 파일 연결 */}
          {/* 여기부터 스피드 모드 */}
          <div className="Motor_Port">
            <div className="Motor-port-div">
              <label htmlFor="speed-mode">스피드 모드</label>
              <div className="input-container">
                <label>스피드</label>
                <input id="speedmode-speed-input" type="number" />
                <label>목표 위치</label>
                <input id="speedmode-position-input" type="number" />
                <button
                  className="speedmode-send-button"
                  onClick={handleSpeedMode}
                >
                  전송
                </button>
              </div>
            </div>
            <div className="border_bottom" />
          </div>
          <div className="Motor_Port">
            <div className="Motor-port-div">
              <label htmlFor="speedpower-mode">스피드 + 힘 모드</label>
              <div className="input-container">
                <label>스피드</label>
                <input
                  id="speedpower-speed-input"
                  type="number"
                  defaultValue={0}
                />
                <label>목표 위치</label>
                <input
                  id="speedpower-position-input"
                  type="number"
                  defaultValue={0}
                />
                <label>힘 임계점 (N)</label>
                <input
                  id="speedpower-force-input"
                  type="number"
                  defaultValue={0}
                />
                <button
                  className="speedpower-send-button"
                  onClick={handleSpeedPowerSend}
                >
                  전송
                </button>
              </div>
            </div>
            <div className="border_bottom" />
          </div>
          <div className="Motor_Port">
            <div className="Motor-port-div">
              <div className="input-container">
                <label>힘 제어 모드</label>
                <input
                  id="forcemode-force-input"
                  type="number"
                  value={forceValue}
                  onChange={(e) => handleForceMode(parseFloat(e.target.value))}
                />
                <span>N</span>
                <button
                  className="forcemode-send-button"
                  onClick={() => handleForceMode(forceValue)}
                >
                  전송
                </button>
              </div>
              <input
                type="range"
                id="force-slider"
                min={0}
                max={100}
                step="0.1"
                value={forceValue}
                onChange={handleForceSliderChange}
              />
            </div>
            <div className="border_bottom" />
          </div>
          <div className="Motor_Port">
            <h6 className="second_text">SEND MESSAGE</h6>
            <textarea id="send-message" defaultValue={""} />
          </div>
          <div className="Motor_Port">
            <h6 className="second_text">RESPONSE MESSAGE</h6>
            <textarea id="response-message" defaultValue={""} />
          </div>
          {/* 에러 메시지 표시 */}
          {error && (
            <div style={{ color: "red", margin: "10px 0" }}>{error}</div>
          )}
        </section>
        {/* 여기부터 RF */}
        <section className="Rf">
          <div className="Rf_title">
            <h1 className="title">RF</h1>
            <div className="border_bottom" />
          </div>
          <div className="container">
            <div className="div_left">
              <h6 className="second_text">PORT CONFIG</h6>
              <ul className="horizontality">
                <li className="left">
                  <p>DEVICE</p>
                </li>
                <li className="right">
                  <select>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                  </select>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>BAUDRATE</p>
                </li>
                <li className="right">
                  <select>
                    <option value={1}>19200</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                  </select>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>PARITY</p>
                </li>
                <li className="right">
                  <select>
                    <option value={1}>None</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                  </select>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>DATA BITS</p>
                </li>
                <li className="right">
                  <select>
                    <option value={1}>8</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                  </select>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>STOP BITS</p>
                </li>
                <li className="right">
                  <select>
                    <option value={1}>1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                    <option value={1}>COM1</option>
                  </select>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <button>OPEN PORT</button>
                </li>
                <li className="right">
                  <button>CLOSE PORP</button>
                </li>
              </ul>
              <div className="border_bottom" />
              {/* 여기부터 RF 요청 명령*/}
              <h6 className="second_text">요청 명령</h6>
              <ul className="horizontality">
                <li className="left">
                  <div className="Current_Status">OK</div>
                </li>
                <li className="right">
                  <button>상태 체크</button>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <div className="Current_Status">v1 10</div>
                </li>
                <li className="right">
                  <button>펌웨어 버전</button>
                </li>
              </ul>
              <div className="border_bottom" />
              {/* 여기부터 RF 출력 전압, 전류 요청 (ADC)*/}
              <h6 className="second_text">RF 출력 전압, 전류 요청 (ADC)</h6>
              <ul className="horizontality">
                <li className="left">
                  <p>전압</p>
                </li>
                <li>
                  <textarea defaultValue={""} />
                </li>
                <li className="right">
                  <button>요청</button>
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>전류</p>
                </li>
                <li>
                  <textarea defaultValue={""} />
                </li>
                <li className="right">
                  <button>요청</button>
                </li>
              </ul>
              {/* 여기부터 RF 출력 전압, 전류 요청 (ADC)*/}
              <h6 className="second_text">RF 출력 전압, 전류 요청 (ADC)</h6>
              <ul className="horizontality">
                <li className="left">
                  <div className="Current_Status" />
                </li>
                <li className="right">
                  <button>전송</button>
                </li>
              </ul>
            </div>
            {/* 여기부터 RF 오른쪽 영역 */}
            <div className="div_right">
              <h6 className="second_text">출력 모드 및 CONNECTOR 설정</h6>
              <h6 className="second_text_right">Monopolar/Bipolar 설정</h6>
              <form>
                <input
                  type="radio"
                  id="option1"
                  name="option"
                  defaultValue={1}
                />
                <label htmlFor="option1">MONOPOLAR</label>
                <br />
                <input
                  type="radio"
                  id="option2"
                  name="option"
                  defaultValue={2}
                />
                <label htmlFor="option2">BIPOLAR</label>
                <br />
              </form>
              <h6 className="second_text_right">정전력/정전압 설정</h6>
              <form>
                <input
                  type="radio"
                  id="option1"
                  name="option"
                  defaultValue={1}
                />
                <label htmlFor="option1">정전력</label>
                <br />
                <input
                  type="radio"
                  id="option2"
                  name="option"
                  defaultValue={2}
                />
                <label htmlFor="option2">정전압</label>
                <br />
              </form>
              <h6 className="second_text_right">출력 Connector 설정</h6>
              <form>
                <input
                  type="radio"
                  id="option1"
                  name="option"
                  defaultValue={1}
                />
                <label htmlFor="option1">NONE</label>
                <br />
                <input
                  type="radio"
                  id="option2"
                  name="option"
                  defaultValue={2}
                />
                <label htmlFor="option2">OUTPUT 1</label>
                <br />
                <input
                  type="radio"
                  id="option3"
                  name="option"
                  defaultValue={3}
                />
                <label htmlFor="option1">OUTPUT 2</label>
                <br />
                <input
                  type="radio"
                  id="option4"
                  name="option"
                  defaultValue={4}
                />
                <label htmlFor="option2">OUTPUT 3</label>
                <br />
              </form>
              <button>OPEN PORT</button>
              <div className="border_bottom" />
              {/* 여기부터 출력 LEVEL 및 출력 시간 설정 */}
              <h6 className="second_text_right">
                출력 LEVEL 및 출력 시간 설정
              </h6>
              <form>
                <input
                  type="radio"
                  id="option1"
                  name="option"
                  defaultValue={1}
                />
                <label htmlFor="option1">1MHz</label>
                <br />
                <input
                  type="radio"
                  id="option2"
                  name="option"
                  defaultValue={2}
                />
                <label htmlFor="option2">2MHz</label>
                <br />
              </form>
              {/* 여기부터 RF 출력 전압, 전류 요청 (ADC)*/}
              <h6 className="second_text">RF 출력 전압, 전류 요청 (ADC)</h6>
              <ul className="horizontality">
                <li className="left">
                  <p>Level (0~850)</p>
                </li>
                <li>
                  <textarea defaultValue={""} />
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>Limit-Time (ms) (0.0~65535)</p>
                </li>
                <li>
                  <textarea defaultValue={""} />
                </li>
              </ul>
              <ul className="horizontality">
                <li className="left">
                  <p>On-Time</p>
                </li>
                <li>
                  <textarea defaultValue={""} />
                </li>
              </ul>
              <ul className="horizontality">
                <li>
                  <button>SEND</button>
                </li>
              </ul>
              <ul className="horizontality">
                <li>
                  <button>SHOT</button>
                </li>
              </ul>
              <div className="border_bottom" />
              {/* 여기부터 SEND MESSAGE */}
              <div className="Motor_Port">
                <div className="horizontality">
                  <ul>
                    <li>
                      <h6 className="second_text">SEND MESSAGE</h6>
                    </li>
                    <li>
                      <textarea defaultValue={""} />
                    </li>
                  </ul>
                </div>
              </div>
              {/* 여기부터 RESPONSE MESSAGE */}
              <div className="Motor_Port">
                <div className="horizontality">
                  <ul>
                    <li>
                      <h6 className="second_text">RESPONSE MESSAGE</h6>
                    </li>
                    <li>
                      <textarea defaultValue={""} />
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section className="nav">
          <a href="">
            <img src={right_arrow} alt="icon-arrow-right" />
          </a>
        </section>
      </div>
    </div>
  );
}

export default TestDev;
