import asyncio
import websockets
import json
import time
from motor_threaded_controller import MotorThreadedController

# EEPROM 관련 import
try:
    import smbus2
    eeprom_available = True
    print("[OK] EEPROM 기능 활성화 (smbus2)")
except ImportError:
    eeprom_available = False
    print("[ERROR] smbus2 모듈을 찾을 수 없습니다. EEPROM 기능이 비활성화됩니다.")

# EEPROM 설정
I2C_BUS = 1
EEPROM_ADDRESS = 0x50

# GPIO 초기화 (RPi.GPIO 사용)
gpio_available = False
pin18 = None
needle_tip_connected = False  # 니들팁 연결 상태 (전역 변수)
last_eeprom_data = {"success": False, "error": "니들팁이 연결되지 않음"}  # 마지막 EEPROM 상태

try:
    import RPi.GPIO as GPIO
    from gpiozero import DigitalInputDevice  # pin18용으로 gpiozero 유지
    
    # GPIO 모드 설정
    GPIO.setmode(GPIO.BCM)
    
    # GPIO18은 기존 gpiozero 방식 유지
    pin18 = DigitalInputDevice(18)
    
    # GPIO23은 RPi.GPIO 방식으로 설정
    GPIO.setup(23, GPIO.IN, pull_up_down=GPIO.PUD_UP)  # 풀업 저항 활성화
    
    gpio_available = True
    print("[OK] GPIO 18번(gpiozero), 23번(RPi.GPIO) 핀 입력 모드로 초기화 완료")
except ImportError as ie:
    print(f"[ERROR] GPIO 모듈을 찾을 수 없습니다: {ie}. GPIO 기능이 비활성화됩니다.")
except Exception as e:
    print(f"[ERROR] GPIO 초기화 오류: {e}")

motor = MotorThreadedController()
connected_clients = set()

# GPIO23 인터럽트 핸들러 (RPi.GPIO 방식) - 니들팁 상태만 관리
def gpio23_callback(channel):
    """GPIO23 상태 변화 시 호출되는 인터럽트 핸들러 - 니들팁 체결 상태만 확인"""
    global needle_tip_connected
    
    if not gpio_available:
        return
    
    # GPIO23 상태 읽기 (LOW = 니들팁 연결됨, HIGH = 니들팁 분리됨)
    current_state = not GPIO.input(23)  # 반전 (LOW일 때 True)
    
    if current_state != needle_tip_connected:
        needle_tip_connected = current_state
        print(f"[GPIO23] 니들팁 상태 변경: {'연결됨' if needle_tip_connected else '분리됨'}")
        
        # EEPROM 데이터는 명시적으로 지우기 전까지 유지 (자동 초기화 제거)

# GPIO23 인터럽트 설정 (RPi.GPIO 방식) - 니들팁 상태만 감지
if gpio_available:
    try:
        # 초기 상태 설정
        needle_tip_connected = not GPIO.input(23)  # LOW일 때 True
        print(f"[GPIO23] 초기 니들팁 상태: {'연결됨' if needle_tip_connected else '분리됨'}")
        
        # 인터럽트 핸들러 등록 (BOTH 엣지에서 상태 변화 감지)
        GPIO.add_event_detect(23, GPIO.BOTH, callback=gpio23_callback, bouncetime=200)
        
        # EEPROM 읽기는 write 명령 시에만 수행하므로 초기 로드 안 함
        print("[OK] GPIO23 인터럽트 핸들러 등록 완료 (RPi.GPIO) - 니들팁 상태만 감지")
    except Exception as e:
        print(f"[ERROR] GPIO23 인터럽트 설정 오류: {e}")

# EEPROM 관련 함수들
def write_eeprom_data(tip_type, shot_count, year, month, day, maker_code):
    """
    EEPROM에 데이터 쓰기
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}
    
    try:
        bus = smbus2.SMBus(I2C_BUS)
        
        # TIP TYPE 쓰기 (0x10)
        bus.write_byte_data(EEPROM_ADDRESS, 0x10, tip_type)
        time.sleep(0.1)
        
        # SHOT COUNT 쓰기 (0x11~0x12) - 2바이트
        bus.write_i2c_block_data(EEPROM_ADDRESS, 0x11, [shot_count >> 8, shot_count & 0xFF])
        time.sleep(0.1)
        
        # 제조일 쓰기 (0x19~0x1B) - 년도는 2000년 기준으로 오프셋
        bus.write_i2c_block_data(EEPROM_ADDRESS, 0x19, [year - 2000, month, day])
        time.sleep(0.1)
        
        # 제조사 코드 쓰기 (0x1C)
        bus.write_byte_data(EEPROM_ADDRESS, 0x1C, maker_code)
        time.sleep(0.1)
        
        bus.close()
        
        return {
            "success": True,
            "message": "EEPROM 쓰기 성공",
            "data": {
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code
            }
        }
        
    except Exception as e:
        return {"success": False, "error": f"EEPROM 쓰기 실패: {str(e)}"}

def read_eeprom_data():
    """
    EEPROM에서 데이터 읽기
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}
    
    bus = None
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            bus = smbus2.SMBus(I2C_BUS)
            
            # TIP TYPE 읽기 (0x10)
            tip_type = bus.read_byte_data(EEPROM_ADDRESS, 0x10)
            
            # SHOT COUNT 읽기 (0x11~0x12)
            shot_count_bytes = bus.read_i2c_block_data(EEPROM_ADDRESS, 0x11, 2)
            shot_count = shot_count_bytes[0] << 8 | shot_count_bytes[1]
            
            # 제조일 읽기 (0x19~0x1B)
            manufacture_date = bus.read_i2c_block_data(EEPROM_ADDRESS, 0x19, 3)
            year = 2000 + manufacture_date[0]
            month = manufacture_date[1]
            day = manufacture_date[2]
            
            # 제조사 코드 읽기 (0x1C)
            maker_code = bus.read_byte_data(EEPROM_ADDRESS, 0x1C)
            
            return {
                "success": True,
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code
            }
            
        except Exception as e:
            print(f"[ERROR] EEPROM 읽기 시도 {attempt + 1}/{max_retries} 실패: {str(e)}")
            if attempt < max_retries - 1:
                time.sleep(0.1)  # 짧은 대기 후 재시도
            else:
                return {"success": False, "error": f"EEPROM 읽기 실패 (모든 재시도 소진): {str(e)}"}
        finally:
            # 버스 리소스 확실히 해제
            if bus is not None:
                try:
                    bus.close()
                except:
                    pass
                bus = None

async def handler(websocket):
    print("[INFO] 클라이언트 연결됨")
    connected_clients.add(websocket)
    try:
        async for msg in websocket:
            try:
                data = json.loads(msg)

                if data["cmd"] == "connect":
                    port = data.get("port")
                    baudrate = data.get("baudrate")
                    parity = data.get("parity")
                    databits = data.get("databits")
                    stopbits = data.get("stopbits")

                    result = motor.connect(port, baudrate, parity, databits, stopbits)
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": result
                    }))

                elif data["cmd"] == "disconnect":
                    result = motor.disconnect()
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": result
                    }))

                elif data["cmd"] == "move":
                    mode = data.get("mode", "servo")
                    position = data.get("position")
                    speed = data.get("speed")
                    force = data.get("force")
                    
                    # 모터 이동 명령 처리
                    
                    if mode == "servo" or mode == "position":
                        if position is not None:
                            result = motor.move_to_position(position, mode)
                            print(f"[INFO] 모터 이동 결과: {result}")
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "위치 값이 없습니다."
                            }))
                    
                    elif mode == "speed":
                        if speed is not None and position is not None:
                            result = motor.move_with_speed(speed, position)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "속도 또는 위치 값이 없습니다."
                            }))
                    
                    elif mode == "speed_force":
                        if all(v is not None for v in [force, speed, position]):
                            result = motor.move_with_speed_force(force, speed, position)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "힘, 속도, 또는 위치 값이 없습니다."
                            }))
                    
                    elif mode == "force":
                        if force is not None:
                            result = motor.set_force(force)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "힘 값이 없습니다."
                            }))
                    
                    else:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": f"❌ 지원하지 않는 모드입니다: {mode}"
                        }))

                elif data["cmd"] == "check":
                    connected = motor.is_connected()
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": "연결됨" if connected else "연결 안됨"
                    }))

                elif data["cmd"] == "gpio_read":
                    if gpio_available and pin18:
                        gpio_value = pin18.value
                        state_text = "HIGH" if gpio_value else "LOW"
                        print(f"[INFO] GPIO 18번 상태: {state_text} (value: {gpio_value})")
                        await websocket.send(json.dumps({
                            "type": "gpio",
                            "pin": 18,
                            "state": state_text
                        }))
                    else:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": "GPIO 기능이 비활성화되어 있습니다."
                        }))

                elif data["cmd"] == "eeprom_write":
                    tip_type = data.get("tipType")
                    shot_count = data.get("shotCount", 0)
                    year = data.get("year")
                    month = data.get("month")
                    day = data.get("day")
                    maker_code = data.get("makerCode")
                    
                    print(f"[INFO] EEPROM 쓰기 요청: TIP_TYPE={tip_type}, SHOT_COUNT={shot_count}, DATE={year}-{month}-{day}, MAKER={maker_code}")
                    
                    if tip_type is None or year is None or month is None or day is None or maker_code is None:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": "필수 데이터가 누락되었습니다."
                        }))
                    else:
                        result = write_eeprom_data(tip_type, shot_count, year, month, day, maker_code)
                        
                        # 쓰기 성공 후 바로 읽어서 데이터 포함
                        if result.get("success"):
                            read_result = read_eeprom_data()
                            if read_result.get("success"):
                                result["data"] = read_result  # 읽은 데이터를 응답에 포함
                                print(f"[INFO] EEPROM 쓰기 후 읽기 성공: {read_result}")
                            else:
                                print(f"[WARN] EEPROM 쓰기 후 읽기 실패: {read_result}")
                        
                        await websocket.send(json.dumps({
                            "type": "eeprom_write",
                            "result": result
                        }))

                elif data["cmd"] == "eeprom_read":
                    print(f"[INFO] EEPROM 읽기 요청")
                    result = read_eeprom_data()
                    await websocket.send(json.dumps({
                        "type": "eeprom_read",
                        "result": result
                    }))

                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "result": "알 수 없는 명령어입니다."
                    }))

            except Exception as e:
                print(f"[ERROR] 처리 중 에러: {str(e)}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "result": str(e)
                }))
    finally:
        connected_clients.discard(websocket)
        print("[INFO] 클라이언트 연결 해제됨")

async def push_motor_status():
    
    while True:
        await asyncio.sleep(0.05)
        if motor.is_connected():
            # GPIO 상태 읽기
            gpio18_state = "UNKNOWN"
            gpio23_state = "UNKNOWN"
            
            if gpio_available and pin18:
                gpio_value = pin18.value
                gpio18_state = "HIGH" if gpio_value else "LOW"
            
            if gpio_available:
                gpio23_value = GPIO.input(23)
                gpio23_state = "HIGH" if gpio23_value else "LOW"

            # EEPROM 데이터는 GPIO23 인터럽트에서 관리되므로 전역 변수 사용
            data = {
                "type": "status",
                "data": {
                    "position": motor.position,
                    "force": motor.force,
                    "sensor": motor.sensor,
                    "setPos": motor.setPos,
                    "gpio18": gpio18_state,  # 기존 GPIO18 상태
                    "gpio23": gpio23_state,  # 새로운 GPIO23 상태 추가
                    "needle_tip_connected": needle_tip_connected,  # 니들팁 연결 상태
                    "eeprom": last_eeprom_data  # 인터럽트에서 업데이트되는 EEPROM 데이터
                }
            }

            # 상태 데이터 전송 (로그 제거로 성능 개선)

            for ws in connected_clients.copy():
                try:
                    await ws.send(json.dumps(data))
                except Exception as e:
                    print(f"[WARN] 상태 전송 실패: {e}")
                    connected_clients.discard(ws)

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("[INFO] WebSocket 모터 서버 실행 중 (ws://0.0.0.0:8765)")
        await push_motor_status()  # 상태 주기 전송 루프 시작

def cleanup_gpio():
    """GPIO 리소스 정리"""
    if gpio_available:
        try:
            GPIO.cleanup()
            print("[OK] GPIO 리소스 정리 완료")
        except Exception as e:
            print(f"[ERROR] GPIO 정리 오류: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] 프로그램 종료 중...")
    finally:
        cleanup_gpio()
