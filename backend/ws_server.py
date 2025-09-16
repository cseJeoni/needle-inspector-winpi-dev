import asyncio
import websockets
import json
import time
from motor_threaded_controller import MotorThreadedController
from resistance import measure_resistance_once  # 저항 측정 일회성 함수 import

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

# MTR 버전별 EEPROM 설정
MTR20_EEPROM_ADDRESS = 0x50
MTR20_CLASSYS_OFFSET = 0x10
MTR20_CUTERA_OFFSET = 0x80

MTR40_EEPROM_ADDRESS = 0x51
MTR40_OFFSET = 0x70

# GPIO 초기화 (gpiozero 사용)
gpio_available = False
pin18 = None
pin23 = None  # GPIO23 객체 (니들팁 연결 감지용)
needle_tip_connected = False  # 니들팁 연결 상태 (전역 변수)
last_eeprom_data = {"success": False, "error": "니들팁이 연결되지 않음"}  # 마지막 EEPROM 상태

try:
    from gpiozero import DigitalInputDevice, Button
    
    # GPIO18: 기존 DigitalInputDevice 유지
    pin18 = DigitalInputDevice(18)
    
    # GPIO23: Button 클래스로 니들팁 연결 감지 (내부 풀업, 바운스 타임 지원)
    pin23 = Button(23, pull_up=True, bounce_time=0.2)
    
    gpio_available = True
    print("[OK] GPIO 18번, 23번 핀 초기화 완료 (gpiozero 라이브러리)")
except ImportError as ie:
    print(f"[ERROR] GPIO 모듈을 찾을 수 없습니다: {ie}. GPIO 기능이 비활성화됩니다.")
except Exception as e:
    print(f"[ERROR] GPIO 초기화 오류: {e}")

motor = MotorThreadedController()
connected_clients = set()

# GPIO23 이벤트 핸들러 (gpiozero 방식) - 니들팁 상태만 관리
def _on_tip_connected():
    """니들팁 연결 시 호출되는 이벤트 핸들러"""
    global needle_tip_connected
    needle_tip_connected = True
    print("[GPIO23] 니들팁 상태 변경: 연결됨")

def _on_tip_disconnected():
    """니들팁 분리 시 호출되는 이벤트 핸들러"""
    global needle_tip_connected
    needle_tip_connected = False
    print("[GPIO23] 니들팁 상태 변경: 분리됨")

# GPIO23 이벤트 핸들러 설정 (gpiozero 방식)
if gpio_available and pin23:
    try:
        # 초기 니들팁 상태 설정 (is_pressed는 풀업 상태에서 LOW일 때 True)
        needle_tip_connected = pin23.is_pressed
        print(f"[GPIO23] 초기 니들팁 상태: {'연결됨' if needle_tip_connected else '분리됨'}")
        
        # 이벤트 핸들러 할당
        pin23.when_pressed = _on_tip_connected
        pin23.when_released = _on_tip_disconnected
        
        print("[OK] GPIO23 이벤트 핸들러 등록 완료 (gpiozero) - 니들팁 상태 감지")
    except Exception as e:
        print(f"[ERROR] GPIO23 이벤트 설정 오류: {e}")


# EEPROM 관련 함수들 - 간소화된 API
def write_eeprom_mtr20(tip_type, shot_count, year, month, day, maker_code, country="CLASSYS"):
    """
    MTR 2.0용 EEPROM 쓰기 함수
    
    Args:
        tip_type: TIP ID (1바이트)
        shot_count: Shot Count (2바이트)
        year: 제조 년도
        month: 제조 월
        day: 제조 일
        maker_code: 제조업체 코드 (1바이트)
        country: 국가 ("CLASSYS" 또는 "CUTERA")
    
    EEPROM 설정:
        - CLASSYS: 주소 0x50, 오프셋 0x10
        - CUTERA: 주소 0x50, 오프셋 0x80
    
    데이터 구조 (오프셋 기준):
        offset + 0: TIP ID (1바이트)
        offset + 1~2: Shot Count (2바이트, big-endian)
        offset + 3~8: Reserve (6바이트)
        offset + 9~11: 제조 년/월/일 (3바이트)
        offset + 12: 제조업체 (1바이트)
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}

    # 국가에 따른 오프셋 설정
    eeprom_address = MTR20_EEPROM_ADDRESS
    offset = MTR20_CUTERA_OFFSET if country == "CUTERA" else MTR20_CLASSYS_OFFSET

    try:
        bus = smbus2.SMBus(I2C_BUS)

        # TIP ID (offset + 0)
        bus.write_byte_data(eeprom_address, offset + 0, tip_type)
        time.sleep(0.01)

        # SHOT COUNT (offset + 1: H, offset + 2: L) - big-endian
        bus.write_byte_data(eeprom_address, offset + 1, (shot_count >> 8) & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 2, shot_count & 0xFF)
        time.sleep(0.01)

        # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
        bus.write_byte_data(eeprom_address, offset + 9, (year - 2000) & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 10, month & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 11, day & 0xFF)
        time.sleep(0.01)

        # MAKER CODE (offset + 12)
        bus.write_byte_data(eeprom_address, offset + 12, maker_code & 0xFF)
        time.sleep(0.01)

        bus.close()
        return {"success": True, "message": f"MTR 2.0 {country} EEPROM 쓰기 성공 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X})"}

    except Exception as e:
        return {"success": False, "error": f"EEPROM 쓰기 실패: {e}"}


def read_eeprom_mtr20(country="CLASSYS"):
    """
    MTR 2.0용 EEPROM 읽기 함수
    
    Args:
        country: 국가 ("CLASSYS" 또는 "CUTERA")
    
    EEPROM 설정:
        - CLASSYS: 주소 0x50, 오프셋 0x10
        - CUTERA: 주소 0x50, 오프셋 0x80
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}

    # 국가에 따른 오프셋 설정
    eeprom_address = MTR20_EEPROM_ADDRESS
    offset = MTR20_CUTERA_OFFSET if country == "CUTERA" else MTR20_CLASSYS_OFFSET

    bus = None
    max_retries = 3

    for attempt in range(max_retries):
        try:
            bus = smbus2.SMBus(I2C_BUS)

            # TIP ID (offset + 0)
            tip_type = bus.read_byte_data(eeprom_address, offset + 0)

            # SHOT COUNT (offset + 1=H, offset + 2=L)
            shot = bus.read_i2c_block_data(eeprom_address, offset + 1, 2)
            shot_count = (shot[0] << 8) | shot[1]

            # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
            year_off = bus.read_byte_data(eeprom_address, offset + 9)
            month = bus.read_byte_data(eeprom_address, offset + 10)
            day = bus.read_byte_data(eeprom_address, offset + 11)
            year = 2000 + year_off

            # MAKER CODE (offset + 12)
            maker_code = bus.read_byte_data(eeprom_address, offset + 12)

            return {
                "success": True,
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code,
                "mtrVersion": "2.0",
                "country": country,
                "eepromAddress": f"0x{eeprom_address:02X}",
                "offset": f"0x{offset:02X}"
            }

        except Exception as e:
            print(f"[ERROR] MTR 2.0 {country} EEPROM 읽기 시도 {attempt + 1}/{max_retries} 실패 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X}): {e}")
            if attempt < max_retries - 1:
                time.sleep(0.1)
            else:
                return {"success": False, "error": f"EEPROM 읽기 실패: {e}"}
        finally:
            if bus is not None:
                try: bus.close()
                except: pass


def write_eeprom_mtr40(tip_type, shot_count, year, month, day, maker_code):
    """
    MTR 4.0용 EEPROM 쓰기 함수
    
    Args:
        tip_type: TIP ID (1바이트)
        shot_count: Shot Count (2바이트)
        year: 제조 년도
        month: 제조 월
        day: 제조 일
        maker_code: 제조업체 코드 (1바이트)
    
    EEPROM 설정: 주소 0x51, 오프셋 0x70
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}

    eeprom_address = MTR40_EEPROM_ADDRESS
    offset = MTR40_OFFSET

    try:
        bus = smbus2.SMBus(I2C_BUS)

        # TIP ID (offset + 0)
        bus.write_byte_data(eeprom_address, offset + 0, tip_type)
        time.sleep(0.01)

        # SHOT COUNT (offset + 1: H, offset + 2: L) - big-endian
        bus.write_byte_data(eeprom_address, offset + 1, (shot_count >> 8) & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 2, shot_count & 0xFF)
        time.sleep(0.01)

        # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
        bus.write_byte_data(eeprom_address, offset + 9, (year - 2000) & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 10, month & 0xFF)
        time.sleep(0.01)
        bus.write_byte_data(eeprom_address, offset + 11, day & 0xFF)
        time.sleep(0.01)

        # MAKER CODE (offset + 12)
        bus.write_byte_data(eeprom_address, offset + 12, maker_code & 0xFF)
        time.sleep(0.01)

        bus.close()
        return {"success": True, "message": f"MTR 4.0 EEPROM 쓰기 성공 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X})"}

    except Exception as e:
        return {"success": False, "error": f"EEPROM 쓰기 실패: {e}"}


def read_eeprom_mtr40():
    """
    MTR 4.0용 EEPROM 읽기 함수
    
    EEPROM 설정: 주소 0x51, 오프셋 0x70
    """
    if not eeprom_available:
        return {"success": False, "error": "EEPROM 기능이 비활성화되어 있습니다."}

    eeprom_address = MTR40_EEPROM_ADDRESS
    offset = MTR40_OFFSET

    bus = None
    max_retries = 3

    for attempt in range(max_retries):
        try:
            bus = smbus2.SMBus(I2C_BUS)

            # TIP ID (offset + 0)
            tip_type = bus.read_byte_data(eeprom_address, offset + 0)

            # SHOT COUNT (offset + 1=H, offset + 2=L)
            shot = bus.read_i2c_block_data(eeprom_address, offset + 1, 2)
            shot_count = (shot[0] << 8) | shot[1]

            # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
            year_off = bus.read_byte_data(eeprom_address, offset + 9)
            month = bus.read_byte_data(eeprom_address, offset + 10)
            day = bus.read_byte_data(eeprom_address, offset + 11)
            year = 2000 + year_off

            # MAKER CODE (offset + 12)
            maker_code = bus.read_byte_data(eeprom_address, offset + 12)

            return {
                "success": True,
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code,
                "mtrVersion": "4.0",
                "country": "ALL",
                "eepromAddress": f"0x{eeprom_address:02X}",
                "offset": f"0x{offset:02X}"
            }

        except Exception as e:
            print(f"[ERROR] MTR 4.0 EEPROM 읽기 시도 {attempt + 1}/{max_retries} 실패 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X}): {e}")
            if attempt < max_retries - 1:
                time.sleep(0.1)
            else:
                return {"success": False, "error": f"EEPROM 읽기 실패: {e}"}
        finally:
            if bus is not None:
                try: bus.close()
                except: pass

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
                    mtr_version = data.get("mtrVersion", "2.0")  # 기본값: MTR 2.0
                    country = data.get("country", "CLASSYS")    # 기본값: CLASSYS
                    
                    print(f"[DEBUG] EEPROM 쓰기 - 원본 데이터: {data}")
                    print(f"[INFO] EEPROM 쓰기 요청: MTR={mtr_version}, 국가={country}, TIP_TYPE={tip_type}, SHOT_COUNT={shot_count}, DATE={year}-{month}-{day}, MAKER={maker_code}")
                    
                    if tip_type is None or year is None or month is None or day is None or maker_code is None:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": "필수 데이터가 누락되었습니다."
                        }))
                    else:
                        # MTR 버전과 국가에 따라 적절한 함수 선택
                        if mtr_version == "4.0":
                            result = write_eeprom_mtr40(tip_type, shot_count, year, month, day, maker_code)
                        else:  # MTR 2.0
                            result = write_eeprom_mtr20(tip_type, shot_count, year, month, day, maker_code, country)
                        
                        # 쓰기 성공 후 바로 읽어서 데이터 포함
                        if result.get("success"):
                            # 읽기도 동일한 버전/국가 설정으로 수행
                            if mtr_version == "4.0":
                                read_result = read_eeprom_mtr40()
                            else:  # MTR 2.0
                                read_result = read_eeprom_mtr20(country)
                                
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
                    mtr_version = data.get("mtrVersion", "2.0")  # 기본값: MTR 2.0
                    country = data.get("country", "CLASSYS")    # 기본값: CLASSYS
                    
                    print(f"[DEBUG] EEPROM 읽기 - 원본 데이터: {data}")
                    print(f"[INFO] EEPROM 읽기 요청: MTR={mtr_version}, 국가={country}")
                    
                    # MTR 버전과 국가에 따라 적절한 함수 선택
                    if mtr_version == "4.0":
                        result = read_eeprom_mtr40()
                    else:  # MTR 2.0
                        result = read_eeprom_mtr20(country)
                    
                    await websocket.send(json.dumps({
                        "type": "eeprom_read",
                        "result": result
                    }))

                # 저항 측정 명령 (임시 연결/해제 방식)
                elif data["cmd"] == "measure_resistance":
                    print("[MainServer] 저항 측정 요청 수신 - 임시 연결 방식")
                    
                    # 일회성 저항 측정 (연결 -> 측정 -> 즉시 해제)
                    result = measure_resistance_once(port="/dev/usb-resistance")
                    
                    # 결과를 요청한 클라이언트에게 전송
                    response = {
                        "type": "resistance_measurement",
                        "data": result
                    }
                    await websocket.send(json.dumps(response))
                    print(f"[MainServer] 저항 측정 결과 전송 완료: {result.get('connected', False)}")

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
            
            if gpio_available and pin23:
                # gpiozero Button 객체에서 상태 읽기 (is_pressed가 True이면 LOW 상태)
                gpio23_state = "LOW" if pin23.is_pressed else "HIGH"

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
    """기존 GPIO 리소스 정리"""
    if gpio_available:
        try:
            if pin18:
                pin18.close()
            if pin23:
                pin23.close()
            print("[OK] GPIO 리소스 정리 완료 (gpiozero)")
        except Exception as e:
            print(f"[ERROR] GPIO 정리 오류: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] 프로그램 종료 중...")
    finally:
        cleanup_gpio()