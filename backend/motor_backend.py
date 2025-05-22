import serial

class MotorController:
    def __init__(self):
        self.serial = None
        self.last_position = None
        self.last_force = None
        self.last_sensor = None

    def connect(self, port, baudrate, parity, databits, stopbits):
        if self.serial and self.serial.is_open:
            return "이미 연결되어 있습니다."

        try:
            parity_map = {
                "none": serial.PARITY_NONE,
                "even": serial.PARITY_EVEN,
                "odd": serial.PARITY_ODD,
                "mark": serial.PARITY_MARK,
                "space": serial.PARITY_SPACE
            }

            stopbits_map = {
                "1": serial.STOPBITS_ONE,
                "1.5": serial.STOPBITS_ONE_POINT_FIVE,
                "2": serial.STOPBITS_TWO
            }

            if not port:
                return "포트가 지정되지 않았습니다."
            if not baudrate:
                return "통신 속도가 지정되지 않았습니다."
            if parity.lower() not in parity_map:
                return f"지원하지 않는 parity 값입니다: {parity}"
            if str(stopbits) not in stopbits_map:
                return f"지원하지 않는 stopbits 값입니다: {stopbits}"

            self.serial = serial.Serial(
                port=port,
                baudrate=int(baudrate),
                bytesize=int(databits),
                parity=parity_map[parity.lower()],
                stopbits=stopbits_map[str(stopbits)],
                timeout=1
            )
            return "✅ 포트 연결 성공"
        except serial.SerialException as e:
            return f"❌ 시리얼 포트 오류: {str(e)}"
        except Exception as e:
            return f"❌ 포트 연결 실패: {str(e)}"

    def disconnect(self):
        if self.serial and self.serial.is_open:
            self.serial.close()
            return "🔌 포트 연결 해제 완료"
        return "포트가 이미 닫혀 있습니다."

    def is_connected(self):
        return self.serial and self.serial.is_open

    def move_to_position(self, pos: int):
        if not self.serial or not self.serial.is_open:
            return "❌ 포트가 열려있지 않습니다."
        try:
            cmd = generate_motor_command(pos)
            self.serial.write(cmd)
            return f"📤 명령 전송 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 전송 실패: {str(e)}"

    def read_status(self):
        if not self.serial or not self.serial.is_open:
            return "❌ 포트가 열려있지 않습니다."

        try:
            # 상태 요청 명령 전송
            status_cmd = bytes.fromhex("55AA04010000000033")
            print(f"[DEBUG] 상태 요청 명령 전송: {status_cmd.hex().upper()}")
            self.serial.write(status_cmd)
            
            # 응답 대기
            response = self.serial.read(64)
            print(f"[DEBUG] 수신된 응답 길이: {len(response)}")
            print(f"[DEBUG] 수신된 응답: {response.hex().upper()}")
            
            if len(response) < 30:
                return "❌ 응답이 충분하지 않음"

            try:
                hex_str = response.hex().upper()
                print(f"[DEBUG] 응답 HEX: {hex_str}")
                
                # 응답 형식 검증
                if not hex_str.startswith("55AA"):
                    return "❌ 잘못된 응답 형식"
                
                # 데이터 위치 계산
                data_start = 8  # 헤더(4바이트) + 길이(2바이트) + 명령(2바이트)
                rec_val = hex_str[data_start:data_start+4]
                force_val = hex_str[data_start+4:data_start+8]
                sensor_val = hex_str[data_start+8:data_start+12]
                
                print(f"[DEBUG] 추출된 값 - 위치: {rec_val}, 힘: {force_val}, 센서: {sensor_val}")

                # 바이트 순서 변경 (리틀 엔디안)
                reorder = rec_val[2:] + rec_val[:2]
                force_reorder = force_val[2:] + force_val[:2]
                sensor_reorder = sensor_val[2:] + sensor_val[:2]

                position = int(reorder, 16)
                force = int(force_reorder, 16)
                sensor = int(sensor_reorder, 16)

                # 부호 처리
                if position >= 0x8000:
                    position -= 0x10000
                if force >= 0x8000:
                    force -= 0x10000
                if sensor >= 0x8000:
                    sensor -= 0x10000

                force_n = round(force * 0.001 * 9.81, 1)

                print(f"[DEBUG] 변환된 값 - 위치: {position}, 힘: {force_n}N, 센서: {sensor}")

                self.last_position = position
                self.last_force = force_n
                self.last_sensor = sensor

                return {
                    "position": position,
                    "force": force_n,
                    "sensor": sensor
                }
            except Exception as e:
                print(f"[ERROR] 데이터 파싱 중 오류: {str(e)}")
                return f"❌ 데이터 파싱 실패: {str(e)}"
                
        except Exception as e:
            print(f"[ERROR] 상태 읽기 중 오류: {str(e)}")
            return f"❌ 상태 읽기 실패: {str(e)}"
