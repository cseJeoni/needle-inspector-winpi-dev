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
    generate_speed_force_mode_command,
    generate_status_read_command
)

class DualMotorController:
    def __init__(self):
        self.serial = None
        self.command_queue = Queue()  # 명령어 큐 시스템
        self.lock = Lock()
        self.running = False
        self.sender_thread = None
        self.reader_thread = None
        self.last_command_motor1 = None
        self.last_command_motor2 = None
        self.motor1_status_mode = True  # True: 상태 읽기, False: 이동 명령
        self.motor2_status_mode = True  # True: 상태 읽기, False: 이동 명령

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
        self.motor2_deceleration_info = None # 감속 정보 저장
        
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
            
            # 모터1과 모터2를 상태 읽기 모드로 초기화
            with self.lock:
                self.motor1_status_mode = True
                self.last_command_motor1 = generate_status_read_command(motor_id=0x01)
                print(f"[INFO] 모터1 상태 읽기 모드 초기화: {self.last_command_motor1.hex().upper()}")
                
                self.motor2_status_mode = True
                self.last_command_motor2 = generate_status_read_command(motor_id=0x02)
                print(f"[INFO] 모터2 상태 읽기 모드 초기화: {self.last_command_motor2.hex().upper()}")
            
            self.sender_thread = Thread(target=self.send_loop, daemon=True)
            self.reader_thread = Thread(target=self.read_loop, daemon=True)
            self.sender_thread.start()
            self.reader_thread.start()

            return "✅ 포트 연결 및 듀얼 모터 스레드 시작 성공"
        except Exception as e:
            return f"❌ 포트 연결 실패: {str(e)}"

    def disconnect(self):
        self.running = False
        # 명령어 큐 초기화
        self.clear_queue()
        if self.serial and self.serial.is_open:
            self.serial.close()
            return "🔌 포트 연결 해제 완료"
        return "포트가 이미 닫혀 있습니다."

    def is_connected(self):
        return self.serial and self.serial.is_open

    # Motor 1 (기존 모터) 제어 함수들
    def move_to_position(self, pos: int, mode="position"):
        return self.move_to_position_motor1(pos, mode)

    def move_to_position_motor1(self, pos: int, mode="position"):
        try:
            if mode == "servo":
                cmd = generate_servo_mode_command(pos, motor_id=0x01)
            elif mode == "position":
                cmd = generate_position_mode_command(pos, motor_id=0x01)
            else:
                return f"❌ 지원하지 않는 모드입니다: {mode}"

            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터1 이동 명령 큐잉 - 위치: {pos} ({pos/100:.1f}mm), 모드: {mode}")
                
                # 이동 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor1_status_mode = True
                    self.last_command_motor1 = generate_status_read_command(motor_id=0x01)
            else:
                print(f"[ERROR] 모터1 이동 실패 - 시리얼 포트 닫혀있음")
                return "❌ 시리얼 포트가 열려있지 않습니다"
                    
            return f"📤 모터1 위치 이동 명령 큐잉 완료: {' '.join([cmd.hex()[i:i+2].upper() for i in range(0, len(cmd.hex()), 2)])}"
        except Exception as e:
            return f"❌ 모터1 명령 큐잉 실패: {str(e)}"

    def move_with_speed(self, speed: int, position: int):
        return self.move_with_speed_motor1(speed, position)

    def move_with_speed_motor1(self, speed: int, position: int):
        try:
            cmd = generate_speed_mode_command(speed, position, motor_id=0x01)
            
            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터1 속도/위치 명령 큐잉 - 속도: {speed}, 위치: {position} ({position/100:.1f}mm)")
                
                # 이동 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor1_status_mode = True
                    self.last_command_motor1 = generate_status_read_command(motor_id=0x01)
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"
                    
            return f"📤 모터1 속도/위치 이동 명령 큐잉 완료: {' '.join([cmd.hex()[i:i+2].upper() for i in range(0, len(cmd.hex()), 2)])}"
        except Exception as e:
            return f"❌ 모터1 명령 큐잉 실패: {str(e)}"

    def set_force(self, force: float):
        return self.set_force_motor1(force)

    def set_force_motor1(self, force: float):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_force_mode_command(force_g, motor_id=0x01)
            
            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터1 힘 제어 명령 큐잉 - 힘: {force}N ({force_g}g)")
                
                # 힘 제어 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor1_status_mode = True
                    self.last_command_motor1 = generate_status_read_command(motor_id=0x01)
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"
                    
            return f"📤 모터1 힘 제어 명령 큐잉 완료: {' '.join([cmd.hex()[i:i+2].upper() for i in range(0, len(cmd.hex()), 2)])}"
        except Exception as e:
            return f"❌ 모터1 명령 큐잉 실패: {str(e)}"

    def move_with_speed_force(self, force: float, speed: int, position: int):
        return self.move_with_speed_force_motor1(force, speed, position)

    def move_with_speed_force_motor1(self, force: float, speed: int, position: int):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_speed_force_mode_command(force_g, speed, position, motor_id=0x01)
            
            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터1 속도/힘/위치 명령 큐잉 - 힘: {force}N, 속도: {speed}, 위치: {position} ({position/100:.1f}mm)")
                
                # 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor1_status_mode = True
                    self.last_command_motor1 = generate_status_read_command(motor_id=0x01)
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"
                    
            return f"📤 모터1 속도/힘/위치 이동 명령 큐잉 완료: {' '.join([cmd.hex()[i:i+2].upper() for i in range(0, len(cmd.hex()), 2)])}"
        except Exception as e:
            return f"❌ 모터1 명령 큐잉 실패: {str(e)}"

    # Motor 2 (저항 측정 모터) 제어 함수들
    def move_to_position_motor2(self, pos: int, mode="servo"):
        try:
            if mode == "servo":
                cmd = generate_servo_mode_command(pos, motor_id=0x02)
            elif mode == "position":
                cmd = generate_position_mode_command(pos, motor_id=0x02)
            else:
                return f"❌ 지원하지 않는 모드입니다: {mode}"

            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터2 위치 이동 명령 큐잉 - 위치: {pos} ({pos/40:.1f}mm), 모드: {mode}")
                
                # 이동 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor2_status_mode = True
                    self.last_command_motor2 = generate_status_read_command(motor_id=0x02)
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"
            
            return f"📤 모터2 위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 큐잉 실패: {str(e)}"

    def move_with_speed_motor2(self, speed: int, position: int, deceleration_enabled=False, deceleration_position=0, deceleration_speed=0):
        try:
            cmd = generate_speed_mode_command(speed, position, motor_id=0x02)

            if self.serial and self.serial.is_open:
                # 항상 먼저 감속 정보 초기화 (새로운 이동 명령이 들어왔으므로)
                with self.lock:
                    prev_decel_info = self.motor2_deceleration_info
                    self.motor2_deceleration_info = None
                    print(f"[DEBUG] 모터2 감속 정보 초기화 완료 - 이전 정보: {prev_decel_info}")
                
                # 명령어를 큐에 추가 (우선순위 높음)
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터2 속도/위치 명령 큐잉 - 목표: {position} ({position/40:.1f}mm), 속도: {speed}, 감속활성화: {deceleration_enabled}")

                # 감속 정보 저장 (감속이 활성화된 경우에만)
                with self.lock:
                    if deceleration_enabled and deceleration_position > 0 and deceleration_speed > 0:
                        # 감속 지점 = 목표 위치 + 감속 거리 + 여유 거리 (빠른 속도에서도 감속 놀치지 않도록)
                        safety_margin = 200 if speed >= 2000 else 100  # 속도에 따른 여유 거리 (5mm 또는 2.5mm)
                        decel_point = position + (deceleration_position * 40) + safety_margin
                        self.motor2_deceleration_info = {
                            "target_position": position,
                            "deceleration_point": decel_point,
                            "deceleration_speed": deceleration_speed,
                            "is_decelerating": False # 감속 명령이 한 번만 전송되도록 플래그 추가
                        }
                        print(f"[INFO] 모터2 감속 설정 완료 - 목표위치: {position} ({position/40:.1f}mm), 감속거리: {deceleration_position}mm, 감속지점: {decel_point} ({decel_point/40:.1f}mm), 감속속도: {deceleration_speed}, 이동속도: {speed}, 여유거리: {safety_margin} ({safety_margin/40:.1f}mm)")
                    else:
                        print(f"[INFO] 모터2 일반 이동 (감속 없음) - 목표위치: {position} ({position/40:.1f}mm), 속도: {speed}")
                        self.motor2_deceleration_info = None

                    # 이동 명령 후 상태 읽기 모드로 전환
                    self.motor2_status_mode = True
                    self.last_command_motor2 = generate_status_read_command(motor_id=0x02)
                    print(f"[DEBUG] 모터2 상태 읽기 모드로 전환 완료")
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"

            return f"📤 모터2 속도/위치 이동 명령 큐잉 완료: {' '.join([cmd.hex()[i:i+2].upper() for i in range(0, len(cmd.hex()), 2)])}"
        except Exception as e:
            return f"❌ 모터2 명령 큐잉 실패: {str(e)}"

    def move_with_speed_force_motor2(self, force: float, speed: int, position: int):
        try:
            # N을 g로 변환 (1N = 101.97g)
            force_g = int(force * 101.97)
            cmd = generate_speed_force_mode_command(force_g, speed, position, motor_id=0x02)
            
            # 명령어를 큐에 추가 (우선순위 높음)
            if self.serial and self.serial.is_open:
                self.command_queue.put(cmd)
                print(f"[CMD_QUEUE] 모터2 속도/힘/위치 명령 큐잉 - 힘: {force}N, 속도: {speed}, 위치: {position} ({position/40:.1f}mm)")
                
                # 명령 후 상태 읽기 모드로 전환
                with self.lock:
                    self.motor2_status_mode = True
                    self.last_command_motor2 = generate_status_read_command(motor_id=0x02)
            else:
                return "❌ 시리얼 포트가 열려있지 않습니다"
            
            return f"📤 모터2 속도/힘/위치 이동 명령 큐잉 완료: {cmd.hex().upper()}"
        except Exception as e:
            return f"❌ 모터2 명령 큐잉 실패: {str(e)}"
    
    def get_queue_size(self):
        """현재 명령어 큐의 크기를 반환"""
        return self.command_queue.qsize()
    
    def clear_queue(self):
        """명령어 큐를 비움 (긴급 상황 시 사용)"""
        while not self.command_queue.empty():
            try:
                self.command_queue.get_nowait()
            except Empty:
                break
        print("[CMD_QUEUE] 명령어 큐 초기화 완료")

    def send_loop(self):
        """큐 기반 명령어 전송 루프 - 모든 시리얼 쓰기 작업을 순차적으로 처리"""
        while self.running:
            try:
                # 1. 우선순위 높은 이동/제어 명령어 확인 (큐에서 가져오기)
                try:
                    high_priority_cmd = self.command_queue.get_nowait()
                    
                    # 2. 명령어 전송 및 처리 대기
                    if self.serial and self.serial.is_open:
                        bytes_written = self.serial.write(high_priority_cmd)
                        self.serial.flush()
                        print(f"[CMD_QUEUE] 우선순위 명령 전송: {high_priority_cmd.hex().upper()} ({bytes_written} bytes)")
                        time.sleep(0.02)  # 드라이버 처리 시간 보장 (20ms)
                    
                except Empty:
                    # 3. 큐가 비어있을 때 - 평상시 상태 폴링 수행
                    
                    # Motor 1 상태 읽기
                    with self.lock:
                        if self.last_command_motor1 and self.serial and self.serial.is_open:
                            bytes_written = self.serial.write(self.last_command_motor1)
                            self.serial.flush()
                            if bytes_written != len(self.last_command_motor1):
                                print(f"[Warning] 모터1 전송된 바이트 수 불일치: {bytes_written}/{len(self.last_command_motor1)}")
                    
                    time.sleep(0.01)  # 모터 간 간격 (10ms)
                    
                    # Motor 2 상태 읽기 및 감속 로직 처리
                    with self.lock:
                        # 감속 로직 체크 (감속 정보가 있고, 아직 감속하지 않았을 때만)
                        if self.motor2_deceleration_info and not self.motor2_deceleration_info.get("is_decelerating", False):
                            try:
                                # 모터는 현재 위치(motor2_position)에서 목표 위치(target_position)로 이동 중
                                # 현재 위치가 감속 지점(deceleration_point)을 지났는지 확인
                                # 모터2는 값이 작아지는 방향으로 이동하므로 부등호 주의
                                decel_point = self.motor2_deceleration_info["deceleration_point"]
                                target_pos = self.motor2_deceleration_info["target_position"]
                                
                                # 모터가 DOWN 방향으로 이동 중이고, 목표 위치보다 높은 곳에서 내려올 때만 감속 체크
                                # 추가 조건: 목표 위치가 현재 위치보다 작아야 함 (DOWN 방향 이동)
                                current_pos = self.motor2_position
                                is_moving_down = target_pos < current_pos  # DOWN 방향 이동 체크
                                
                                if (is_moving_down and  # DOWN 방향 이동 중일 때만
                                    current_pos > target_pos and  # 아직 목표에 도달하지 않음
                                    current_pos <= decel_point):  # 감속 지점에 도달함
                                    print(f"[INFO] 모터2 감속 시작 (DOWN 이동). 현재위치: {current_pos} ({current_pos/40:.1f}mm), 감속지점: {decel_point} ({decel_point/40:.1f}mm), 목표위치: {target_pos} ({target_pos/40:.1f}mm)")
                                    
                                    # 감속 명령을 큐에 추가 (우선순위 높음)
                                    new_cmd = generate_speed_mode_command(
                                        self.motor2_deceleration_info["deceleration_speed"],
                                        self.motor2_deceleration_info["target_position"],
                                        motor_id=0x02
                                    )
                                    self.command_queue.put(new_cmd)
                                    
                                    # 감속 명령 전송 완료 표시
                                    self.motor2_deceleration_info["is_decelerating"] = True
                                    print(f"[CMD_QUEUE] 모터2 감속 명령 큐잉 완료 - 속도: {self.motor2_deceleration_info['deceleration_speed']}")
                                    
                                    # 감속 명령 후에는 일반 상태 읽기 명령으로 돌아감
                                    self.last_command_motor2 = generate_status_read_command(motor_id=0x02)
                            except Exception as e:
                                print(f"[ERROR] 모터2 감속 처리 중 오류: {str(e)}")
                                self.motor2_deceleration_info = None  # 오류 발생 시 감속 정보 초기화

                        # 일반 모터2 상태 읽기
                        if self.last_command_motor2 and self.serial and self.serial.is_open:
                            bytes_written = self.serial.write(self.last_command_motor2)
                            self.serial.flush()
                            if bytes_written != len(self.last_command_motor2):
                                print(f"[Warning] 모터2 전송된 바이트 수 불일치: {bytes_written}/{len(self.last_command_motor2)}")
                    
                    time.sleep(0.01)  # 다음 루프까지 대기 (10ms)
                            
            except Exception as e:
                print(f"[CMD_QUEUE Error] {str(e)}")
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
                print(f"[DEBUG] 짧은 프레임 무시: {hex_str} (length: {len(hex_str)})")
                return

            # 모터 ID 확인 (프레임의 6-7번째 문자, 즉 3번째 바이트)
            motor_id_hex = hex_str[6:8]
            motor_id = int(motor_id_hex, 16)

            # 모터1과 모터2 모두 동일한 방식으로 파싱
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
                prev_pos = self.motor1_position
                self.motor1_setPos = setPos
                self.motor1_position = position
                self.motor1_force = round(force * 0.001 * 9.81, 1)
                self.motor1_sensor = sensor
                if abs(position - prev_pos) > 10:  # 위치 변화가 클 때만 로그
                    print(f"[DEBUG] 모터1 상태 업데이트: 위치 {prev_pos} → {position} ({position/100:.1f}mm)")
            elif motor_id == 0x02:
                prev_pos = self.motor2_position
                self.motor2_setPos = setPos
                self.motor2_position = position
                self.motor2_force = round(force * 0.001 * 9.81, 1)
                self.motor2_sensor = sensor
                if abs(position - prev_pos) > 10:  # 위치 변화가 클 때만 로그
                    print(f"[DEBUG] 모터2 상태 업데이트: 위치 {prev_pos} → {position} ({position/40:.1f}mm), setPos: {setPos}")

        except Exception as e:
            print(f"[DualParse Error] {str(e)}")
            print(f"[DualParse Error] frame: {frame.hex().upper()}")
            print(f"[DualParse Error] frame length: {len(frame)}, hex length: {len(frame.hex())}")

    # Motor 2 상태 조회 함수들
    def get_motor2_status(self):
        return {
            "setPos": self.motor2_setPos,
            "position": self.motor2_position,
            "force": self.motor2_force,
            "sensor": self.motor2_sensor
        }
