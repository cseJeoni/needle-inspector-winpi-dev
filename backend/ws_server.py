import asyncio
import websockets
import json
import time
import subprocess  # 1. subprocess, sys 모듈 추가
import sys
from motor_threaded_controller import MotorThreadedController

# EEPROM 및 GPIO 관련 코드는 이전과 동일
try:
    import smbus2
    eeprom_available = True
except ImportError:
    eeprom_available = False

try:
    from gpiozero import DigitalInputDevice, Button
    pin18 = DigitalInputDevice(18)
    pin23 = Button(23, pull_up=True, bounce_time=0.2)
    gpio_available = True
except Exception:
    gpio_available = False
# ... (기타 GPIO/EEPROM 설정 및 함수는 생략, 실제 파일에는 모두 있어야 함) ...

motor = MotorThreadedController()
connected_clients = set()
latest_resistance_data = {}

# 2. 저항 서버 프로세스를 저장할 전역 변수 생성
resistance_process = None

# ... (GPIO 이벤트 핸들러, EEPROM 함수 등 이전 코드와 동일) ...

async def handler(websocket):
    # ... (이전 최종본과 동일) ...
    pass

async def resistance_client_task():
    global latest_resistance_data
    uri = "ws://localhost:8766"
    await asyncio.sleep(2) # 저항 서버가 시작될 시간을 2초 정도 기다려줍니다.

    while True:
        try:
            async with websockets.connect(uri) as websocket:
                print("[MainServer] 저항값 서버에 성공적으로 연결됨.")
                async for message in websocket:
                    data = json.loads(message)
                    if data.get("type") == "resistance_update":
                        res_data = data.get("data", {})
                        latest_resistance_data = {
                            "resistance1": res_data.get('resistance1'),
                            "resistance2": res_data.get('resistance2'),
                            "resistance1_status": res_data.get('status1'),
                            "resistance2_status": res_data.get('status2')
                        }
        except Exception as e:
            print(f"[MainServer] 저항값 서버 연결 실패: {e}. 5초 후 재시도...")
            latest_resistance_data = {"status1": "SERVER_DOWN", "status2": "SERVER_DOWN"}
            await asyncio.sleep(5)

async def push_motor_status():
    # ... (이전 최종본과 동일) ...
    while True:
        if motor.is_connected():
            # ... (상태 데이터 구성)
            data = {
                "type": "status",
                "data": {
                    "position": motor.position,
                    "force": motor.force,
                    # ...
                    **latest_resistance_data
                }
            }
            # ... (데이터 전송)
        await asyncio.sleep(0.05)

async def main():
    global resistance_process # 전역 변수 사용 선언

    # 3. 메인 서버 시작 전, resistance_server.py를 백그라운드 프로세스로 실행
    try:
        print("[MainServer] 저항값 서버를 백그라운드에서 시작합니다...")
        # 현재 파이썬 실행 파일로 resistance_server.py를 실행 (가상환경 자동 적용)
        command = [sys.executable, "resistance_server.py"]
        resistance_process = subprocess.Popen(command)
        print(f"[MainServer] 저항값 서버 프로세스 시작됨 (PID: {resistance_process.pid})")
    except FileNotFoundError:
        print("[ERROR] resistance_server.py 파일을 찾을 수 없습니다. 자동 실행에 실패했습니다.")
        return
    except Exception as e:
        print(f"[ERROR] 저항값 서버 시작 중 오류 발생: {e}")
        return

    # 저항값 수신 클라이언트 작업을 백그라운드에서 시작
    asyncio.create_task(resistance_client_task())
    
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("[MainServer] 메인 WebSocket 서버 실행 중 (ws://0.0.0.0:8765)")
        await push_motor_status()

def cleanup_resources():
    """모든 리소스를 정리하는 함수 (GPIO 및 자식 프로세스)"""
    global resistance_process

    # 4. 메인 서버 종료 시, 백그라운드에서 실행된 저항 서버도 함께 종료
    if resistance_process:
        print(f"[MainServer] 저항값 서버 프로세스(PID: {resistance_process.pid})를 종료합니다...")
        resistance_process.terminate()  # 프로세스에 종료 신호 전송
        resistance_process.wait()       # 프로세스가 완전히 종료될 때까지 기다림
        print("[MainServer] 저항값 서버 프로세스가 성공적으로 종료됨.")

    # 기존 GPIO 정리 코드
    try:
        if gpio_available:
            if pin18: pin18.close()
            if pin23: pin23.close()
            print("[INFO] GPIO 핀 정리 완료")
    except Exception as e:
        print(f"[ERROR] GPIO 정리 중 오류: {e}")

if __name__ == "__main__":
    # (실제 코드에서는 handler, EEPROM 함수 등의 내용을 모두 채워넣어야 합니다)
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] 프로그램 종료 중...")
    finally:
        cleanup_resources()