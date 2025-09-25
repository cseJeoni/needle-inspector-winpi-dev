import serial
import time
import os
import platform
from threading import Thread, Lock
from queue import Queue, Empty
from motor_mode_generators import (
    generate_servo_mode_command,
    generate_position_mode_command,
    generate_speed_mode_command,
    generate_force_mode_command,
    generate_speed_force_mode_command
)

class DualMotorController:
    def __init__(self):
        self.serial = None
        self.send_queue = Queue()
        self.lock = Lock()
        self.running = False
        self.sender_thread = None
        self.reader_thread = None
        self.last_command_motor1 = None
        self.last_command_motor2 = None

        # Motor 1 (기존 모터) 상태
        self.motor1_setPos = 0
        self.motor1_position = 0
        self.motor1_force = 0
        self.motor1_sensor = 0
        
        # Motor 2 (저항 측정 모터) 상태
        self.motor2_setPos = 0
        self.motor2_position = 0
        self.motor2_force = 0
        self.motor2_sensor = 0
        
        # EEPROM 관련 변수 (기존 호환성 유지)
        self.eeprom_data = {
            "success": False,
            "tipType": 0,
            "shotCount": 0,
            "year": 0,
            "month": 0,
            "day": 0,
            "makerCode": 0
        }

    # 기존 호환성을 위한 프로퍼티들 (Motor 1 기준)
    @property
    def setPos(self):
        return self.motor1_setPos
    
    @property
    def position(self):
        return self.motor1_position
    
    @property
    def force(self):
        return self.motor1_force
    
    @property
    def sensor(self):
        return self.motor1_sensor

    def get_platform_port(self, port):
        """플랫폼에 따라 적절한 포트 이름을 반환합니다."""
        system = platform.system().lower()
        
        # 리눅스 환경에서 'usb-motor' 심볼릭 링크 사용
        if system == 'linux':
            if port.lower() == 'auto':
                return '/dev/usb-motor'
            elif not port.startswith('/dev/'):
                return '/dev/usb-motor'
        
        return port

    def __enter__(self):
        """컨텍스트 매니저 진입 - with문 사용 시 자동 연결"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """컨텍스트 매니저 종료 - 예외 발생 여부와 관계없이 자동 해제"""
        self.disconnect()
        return False

    def connect(self, port, baudrate, parity, databits, stopbits):
        if self.serial and self.serial.is_open:
            return "이미 연결되어 있습니다."

        try:
            # 플랫폼에 맞는 포트 이름 가져오기
            port = self.get_platform_port(port)
            
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

            # 사용자가 문자열로 입력했을 경우 처리
            stopbits_key = str(stopbits)
            if stopbits_key == "2" or stopbits_key == "3":
                stopbits_key = "2"
            elif stopbits_key not in stopbits_map:
                stopbits_key = "1"

            self.serial = serial.Serial(
                port=port,
                baudrate=int(baudrate),
                bytesize=int(databits),
                parity=parity_map[parity.lower()],
                stopbits=stopbits_map[stopbits_key],
                timeout=0.1
            )
            self.running = True
            self.sender_thread = Thread(target=self.send_loop, daemon=True)
            self.reader_thread = Thread(target=self.read_loop, daemon=True)
            self.sender_thread.start()
            self.reader_thread.start()

            return "✅ 포트 연결 및 듀얼 모터 스레드 시작 성공"
        except Exception as e:
            return f"❌ 포트 연결 실패: {str(e)}"

    def disconnect(self):
        self.running = False
        if self.serial and self.serial.is_open:
            self.serial.close()
            return "🔌 포트 연결 해제 완료"
        return "포트가 이미 닫혀 있습니다."

    def is_connected(self):
        return self.serial and self.serial.is_open

    # Motor 1 (기존 모터) 제어 함수들
    def move_to_position(self, pos: int, mode="servo"):
        return self.move_to_position_motor1(pos, mode)

    def move_to_position_motor1(self, pos: int, mode="servo"):
        try:
            if mode == "servo":
                cmd = generate_servo_mode_command(pos, motor_id=0x01)
            elif mode == "position":
                cmd = generate_position_mode_command(pos, motor_id=0x01)
            else:
                return f"❌ 지원하지 않는 모드입니다: {mode}"

            with self.lock:
                self.last_command_motor1 = cmd
            return f"📤 모터1 위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터1 명령 생성 실패: {str(e)}"

    def move_with_speed(self, speed: int, position: int):
        return self.move_with_speed_motor1(speed, position)

    def move_with_speed_motor1(self, speed: int, position: int):
        try:
            cmd = generate_speed_mode_command(speed, position, motor_id=0x01)
            with self.lock:
                self.last_command_motor1 = cmd
            return f"📤 모터1 속도/위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터1 명령 생성 실패: {str(e)}"

    def set_force(self, force: float):
        return self.set_force_motor1(force)

    def set_force_motor1(self, force: float):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_force_mode_command(force_g, motor_id=0x01)
            with self.lock:
                self.last_command_motor1 = cmd
            return f"📤 모터1 힘 제어 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터1 명령 생성 실패: {str(e)}"

    def move_with_speed_force(self, force: float, speed: int, position: int):
        return self.move_with_speed_force_motor1(force, speed, position)

    def move_with_speed_force_motor1(self, force: float, speed: int, position: int):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_speed_force_mode_command(force_g, speed, position, motor_id=0x01)
            with self.lock:
                self.last_command_motor1 = cmd
            return f"📤 모터1 속도/힘/위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터1 명령 생성 실패: {str(e)}"

    # Motor 2 (저항 측정 모터) 제어 함수들
    def move_to_position_motor2(self, pos: int, mode="servo"):
        try:
            if mode == "servo":
                cmd = generate_servo_mode_command(pos, motor_id=0x02)
            elif mode == "position":
                cmd = generate_position_mode_command(pos, motor_id=0x02)
            else:
                return f"❌ 지원하지 않는 모드입니다: {mode}"

            with self.lock:
                self.last_command_motor2 = cmd
            return f"📤 모터2 위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 생성 실패: {str(e)}"

    def move_with_speed_motor2(self, speed: int, position: int):
        try:
            cmd = generate_speed_mode_command(speed, position, motor_id=0x02)
            with self.lock:
                self.last_command_motor2 = cmd
            return f"📤 모터2 속도/위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 생성 실패: {str(e)}"

    def set_force_motor2(self, force: float):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_force_mode_command(force_g, motor_id=0x02)
            with self.lock:
                self.last_command_motor2 = cmd
            return f"📤 모터2 힘 제어 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 생성 실패: {str(e)}"

    def move_with_speed_force_motor2(self, force: float, speed: int, position: int):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_speed_force_mode_command(force_g, speed, position, motor_id=0x02)
            with self.lock:
                self.last_command_motor2 = cmd
            return f"📤 모터2 속도/힘/위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 생성 실패: {str(e)}"

    def send_loop(self):
        while self.running:
            try:
                time.sleep(0.025)  # 두 모터를 번갈아 가며 명령 전송하므로 간격을 절반으로
                
                # Motor 1 명령 전송
                with self.lock:
                    if self.last_command_motor1:
                        bytes_written = self.serial.write(self.last_command_motor1)
                        self.serial.flush()
                        if bytes_written != len(self.last_command_motor1):
                            print(f"[Warning] 모터1 전송된 바이트 수 불일치: {bytes_written}/{len(self.last_command_motor1)}")
                
                time.sleep(0.025)  # 모터 간 간격
                
                # Motor 2 명령 전송
                with self.lock:
                    if self.last_command_motor2:
                        bytes_written = self.serial.write(self.last_command_motor2)
                        self.serial.flush()
                        if bytes_written != len(self.last_command_motor2):
                            print(f"[Warning] 모터2 전송된 바이트 수 불일치: {bytes_written}/{len(self.last_command_motor2)}")
                            
            except Exception as e:
                print(f"[DualSendThread Error] {str(e)}")
                time.sleep(0.1)

    def read_loop(self):
        buffer = bytearray()
        while self.running:
            try:
                time.sleep(0.01)
                
                # 시리얼 데이터 읽기
                if hasattr(self.serial, 'in_waiting') and self.serial.in_waiting > 0:
                    data = self.serial.read(self.serial.in_waiting)
                else:
                    data = self.serial.read(1024)
                
                if data:
                    buffer += data

                    while True:
                        if len(buffer) < 2:
                            break

                        # 헤더 확인
                        if buffer[0] == 0xAA and buffer[1] == 0x55:
                            # 다음 헤더 찾기
                            next_header_index = self.find_next_header(buffer)
                            if next_header_index:
                                frame = buffer[:next_header_index]
                                buffer = buffer[next_header_index:]
                                self.parse_response(frame)
                            else:
                                break  # 다음 헤더 없으면 대기
                        else:
                            buffer.pop(0)
            except Exception as e:
                print(f"[DualReadThread Error] {str(e)}")
                time.sleep(0.1)

    def find_next_header(self, buffer):
        try:
            for i in range(2, len(buffer) - 1):
                if buffer[i] == 0xAA and buffer[i+1] == 0x55:
                    return i
            return None
        except Exception as e:
            print(f"[FindHeader Error] {str(e)}")
            return None

    def parse_response(self, frame):
        try:
            hex_str = frame.hex().upper()

            if len(hex_str) < 34:  # 최소 필요한 길이 체크
                return

            # 모터 ID 확인 (프레임의 6-7번째 문자, 즉 3번째 바이트)
            motor_id_hex = hex_str[6:8]
            motor_id = int(motor_id_hex, 16)

            setPos_val = hex_str[14:18]  # setPos
            rec_val = hex_str[18:22]  # actPos
            force_val = hex_str[26:30]  # force
            sensor_val = hex_str[30:34]  # sensor

            setPos_reorder = setPos_val[2:] + setPos_val[:2]
            rec_reorder = rec_val[2:] + rec_val[:2]
            force_reorder = force_val[2:] + force_val[:2]
            sensor_reorder = sensor_val[2:] + sensor_val[:2]

            setPos = int(setPos_reorder, 16)
            position = int(rec_reorder, 16)
            force = int(force_reorder, 16)
            sensor = int(sensor_reorder, 16)

            if setPos >= 0x8000:
                setPos -= 0x10000
            if position >= 0x8000:
                position -= 0x10000
            if force >= 0x8000:
                force -= 0x10000
            if sensor >= 0x8000:
                sensor -= 0x10000

            # 모터 ID에 따라 상태 업데이트
            if motor_id == 0x01:
                self.motor1_setPos = setPos
                self.motor1_position = position
                self.motor1_force = round(force * 0.001 * 9.81, 1)
                self.motor1_sensor = sensor
            elif motor_id == 0x02:
                self.motor2_setPos = setPos
                self.motor2_position = position
                self.motor2_force = round(force * 0.001 * 9.81, 1)
                self.motor2_sensor = sensor

        except Exception as e:
            print(f"[DualParse Error] {str(e)}")
            print(f"[DualParse Error] frame: {frame.hex().upper()}")

    # Motor 2 상태 조회 함수들
    def get_motor2_status(self):
        return {
            "setPos": self.motor2_setPos,
            "position": self.motor2_position,
            "force": self.motor2_force,
            "sensor": self.motor2_sensor
        }
