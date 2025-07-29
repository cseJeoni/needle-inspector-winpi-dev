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

# GPIO 초기화 (gpiozero 사용)
gpio_available = False
pin18 = None
try:
    from gpiozero import DigitalInputDevice
    pin18 = DigitalInputDevice(18)
    gpio_available = True
    print("[OK] GPIO 18번 핀 입력 모드로 초기화 완료 (gpiozero)")
except ImportError:
    print("[ERROR] gpiozero 모듈을 찾을 수 없습니다. GPIO 기능이 비활성화됩니다.")
except Exception as e:
    print(f"[ERROR] GPIO 초기화 오류: {e}")

motor = MotorThreadedController()
connected_clients = set()

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
        
        bus.close()
        
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
        return {"success": False, "error": f"EEPROM 읽기 실패: {str(e)}"}

async def handler(websocket):
    print("[INFO] 클라이언트 연결됨")
    connected_clients.add(websocket)
    try:
        async for msg in websocket:
            try:
                data = json.loads(msg)
                print(f"[INFO] 수신된 메시지: {data}")

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
                    
                    print(f"[INFO] 모터 이동 명령 수신: mode={mode}, position={position}, speed={speed}, force={force}")
                    
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
            gpio_state = "UNKNOWN"
            if gpio_available and pin18:
                gpio_value = pin18.value
                gpio_state = "HIGH" if gpio_value else "LOW"
            
            data = {
                "type": "status",
                "data": {
                    "position": motor.position,
                    "force": motor.force,
                    "sensor": motor.sensor,
                    "setPos": motor.setPos,
                    "gpio18": gpio_state  # GPIO 상태 추가
                }
            }
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

if __name__ == "__main__":
    asyncio.run(main())
