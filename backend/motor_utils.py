import time
import serial
from queue import Empty
from threading import Lock
from PyQt5.QtCore import QThread, pyqtSignal

"""
모터 통신에 필요한:
  - SendThread : 큐에서 명령을 꺼내 시리얼 포트로 전송
  - ReadThread : 시리얼 포트에서 데이터 읽어 파싱
  - RepeatThread: 일정간격(last_command 반복 전송) - (Queue.put)
  - generate_motor_command: 모터 명령 프레임 생성
"""

# -------------------------
# 모터용 송신 스레드
# -------------------------
class SendThread(QThread):
    signal_sent = pyqtSignal(str)
    signal_error = pyqtSignal(str)

    def __init__(self, serial_connection_motor, serial_lock, command_queue):
        """
        serial_connection_motor: 시리얼 포트 객체
        serial_lock: 시리얼 read/write 보호용 Lock
        command_queue: 모터 명령이 들어오는 Queue
        """
        super().__init__()
        self.serial_connection_motor = serial_connection_motor
        self.serial_lock = serial_lock
        self.command_queue = command_queue
        self.running = True

    def run(self):
        while self.running:
            try:
                # 1) 큐에서 명령 꺼내기
                command = self.command_queue.get(timeout=0.1)
                # 2) 시리얼 Lock 잡고 write
                with self.serial_lock:
                    self.serial_connection_motor.write(command)
                # 3) 시그널로 UI에 전송 로그 표시
                self.signal_sent.emit(f"Sent: {command.hex().upper()}")
            except Empty:
                continue
            except Exception as e:
                self.signal_error.emit(f"SendThread Error: {str(e)}")

    def stop(self):
        self.running = False
        self.wait()


# -------------------------
# 모터용 수신 스레드
# -------------------------
class ReadThread(QThread):
    signal_received = pyqtSignal(str)
    signal_error = pyqtSignal(str)

    def __init__(self, serial_connection_motor, serial_lock):
        """
        serial_lock: 시리얼 read/write 보호용 Lock
        """
        super().__init__()
        self.serial_connection_motor = serial_connection_motor
        self.serial_lock = serial_lock
        self.running = True
        self.buffer = bytearray()

    def run(self):
        while self.running:
            try:
                # 시리얼 Lock 잡고 read
                with self.serial_lock:
                    data = self.serial_connection_motor.read(1024)

                if data:
                    self.buffer += data
                    while True:
                        if len(self.buffer) < 2:
                            break
                        # 예: 시작 바이트 AA55
                        if self.buffer[0] == 0xAA and self.buffer[1] == 0x55:
                            if len(self.buffer) >= 11:
                                frame = self.buffer[:11]
                                self.buffer = self.buffer[11:]
                                self.signal_received.emit(f"Received: {frame.hex().upper()}")
                            else:
                                break
                        else:
                            self.buffer = self.buffer[1:]
                time.sleep(0.005)
            except Exception as e:
                self.signal_error.emit(f"ReadThread Error: {str(e)}")

    def stop(self):
        self.running = False
        self.wait()


# -------------------------
# 모터용 반복 전송 스레드
# -------------------------
class RepeatThread(QThread):
    """
    일정 간격(interval)마다 last_command를 queue에 put().
    queue는 Thread-safe이므로, 별도 Lock 없이 사용 가능.
    """
    def __init__(self, command_queue, interval=0.05, parent=None):
        super().__init__(parent)
        self.command_queue = command_queue
        self.interval = interval
        self.running = True
        self.last_command = None

    def run(self):
        while self.running:
            time.sleep(self.interval)
            if self.last_command:
                self.command_queue.put(self.last_command)

    def stop(self):
        self.running = False
        self.wait()

    def set_last_command(self, command: bytes):
        self.last_command = command


# -------------------------
# 모터 명령 프레임 생성 함수
# -------------------------
def generate_motor_command(value):
    """
    예: 모터 위치 이동 명령 (value)
    prime_header: 55AA
    frame_length: 04
    ...
    """
    prime_header = [0x55, 0xAA]
    frame_length = 0x05
    motor_id = 0x01
    command_type = 0x32
    control_table_index = 0x37
    data_segment = [value & 0xFF, (value >> 8) & 0xFF]

    checksum = (frame_length +
                motor_id +
                command_type +
                control_table_index +
                sum(data_segment)) & 0xFF

    return bytes(prime_header
                 + [frame_length, motor_id, command_type, control_table_index]
                 + data_segment
                 + [checksum])

def generate_servo_mode_command(target_position):
    """
    서보 모드로 목표 위치 명령 프레임 생성 (13바이트)
    """
    prime_header = [0x55, 0xAA]
    frame_length = 0x0D
    motor_id = 0x01
    command_type = 0x32

    # 서보 모드 관련 설정
    control_mode_register = [0x25, 0x00]
    control_mode_setting = [0x01, 0x00]
    motor_output_voltage = [0x00, 0x00]
    force_control_register = [0x00, 0x00]
    target_position_register = [0x00, 0x00]

    # 목표 위치 데이터 (리틀 엔디안)
    position_data = [target_position & 0xFF, (target_position >> 8) & 0xFF]

    # 체크섬 계산
    checksum = (
        frame_length + motor_id + command_type +
        sum(control_mode_register) + sum(control_mode_setting) +
        sum(motor_output_voltage) + sum(force_control_register) +
        sum(target_position_register) + sum(position_data)
    ) & 0xFF

    # 최종 명령 프레임 반환
    return bytes(
        prime_header +
        [frame_length, motor_id, command_type] +
        control_mode_register + control_mode_setting +
        motor_output_voltage + force_control_register +
        target_position_register + position_data +
        [checksum]
    )
