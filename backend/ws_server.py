import asyncio
import websockets
import json
import time
from dual_motor_controller import DualMotorController
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
pin5 = None   # GPIO5 객체 (Short 체크용)
pin11 = None  # GPIO11 객체 (니들팁 연결 감지용)
pin6 = None   # GPIO6 객체 (START 버튼 스위치용)
needle_tip_connected = False  # 니들팁 연결 상태 (전역 변수)
last_eeprom_data = {"success": False, "error": "니들팁이 연결되지 않음"}  # 마지막 EEPROM 상태

try:
    from gpiozero import DigitalInputDevice, Button
    
    # GPIO5: Short 체크용 (Button 클래스, 인터럽트 지원)
    pin5 = Button(5, pull_up=True, bounce_time=0.2)
    
    # GPIO11: Button 클래스로 니들팁 연결 감지 (내부 풀업, 바운스 타임 지원)
    pin11 = Button(11, pull_up=True, bounce_time=0.2)
    
    # GPIO6: Button 클래스로 START 버튼 스위치 (내부 풀업, 바운스 타임 지원)
    pin6 = Button(6, pull_up=True, bounce_time=0.2)
    
    gpio_available = True
    print("[OK] GPIO 5번, 11번, 6번 핀 초기화 완료 (gpiozero 라이브러리)")
except ImportError as ie:
    print(f"[ERROR] GPIO 모듈을 찾을 수 없습니다: {ie}. GPIO 기능이 비활성화됩니다.")
except Exception as e:
    print(f"[ERROR] GPIO 초기화 오류: {e}")

motor = DualMotorController()
connected_clients = set()

# GPIO11 이벤트 핸들러 (gpiozero 방식) - 니들팁 상태만 관리
def _on_tip_connected():
    """니들팁 연결 시 호출되는 이벤트 핸들러"""
    global needle_tip_connected
    needle_tip_connected = True
    print("[GPIO11] 니들팁 상태 변경: 연결됨")

def _on_tip_disconnected():
    """니들팁 분리 시 호출되는 이벤트 핸들러"""
    global needle_tip_connected
    needle_tip_connected = False
    print("[GPIO11] 니들팁 상태 변경: 분리됨")

# GPIO5 이벤트 핸들러 (Short 체크)
def _on_short_detected():
    """GPIO5 Short 감지 시 호출되는 이벤트 핸들러"""
    print("[GPIO5] Short 감지됨 (HIGH 상태)")

def _on_short_cleared():
    """GPIO5 Short 해제 시 호출되는 이벤트 핸들러"""
    print("[GPIO5] Short 해제됨 (LOW 상태)")

# GPIO6 이벤트 핸들러 (START 버튼 스위치)
async def _on_start_button_pressed():
    """GPIO6 START 버튼 스위치가 눌렸을 때 호출되는 이벤트 핸들러"""
    print("[GPIO6] START 버튼 스위치 눌림 - 프론트엔드로 START 신호 전송")
    
    # 모든 연결된 클라이언트에게 START 신호 전송
    start_message = {
        "type": "gpio_start_button",
        "data": {
            "triggered": True,
            "timestamp": time.time()
        }
    }
    
    for ws in connected_clients.copy():
        try:
            await ws.send(json.dumps(start_message))
        except Exception as e:
            print(f"[WARN] GPIO6 START 신호 전송 실패: {e}")
            connected_clients.discard(ws)

def _on_start_button_pressed_sync():
    """GPIO6 START 버튼 스위치 동기 래퍼 함수"""
    # 비동기 함수를 동기적으로 실행하기 위한 래퍼
    try:
        # 현재 실행 중인 이벤트 루프가 있는지 확인
        loop = asyncio.get_running_loop()
        # 이미 실행 중인 루프에서 태스크 생성
        asyncio.create_task(_on_start_button_pressed())
    except RuntimeError:
        # 실행 중인 루프가 없으면 새로 생성
        asyncio.run(_on_start_button_pressed())

# GPIO5 이벤트 핸들러 설정 (Short 체크)
if gpio_available and pin5:
    try:
        # GPIO5 초기 상태 확인
        initial_short_state = pin5.is_active
        print(f"[GPIO5] 초기 Short 체크 상태: {'SHORT (HIGH)' if initial_short_state else 'NORMAL (LOW)'}")
        
        # 이벤트 핸들러 할당
        pin5.when_activated = _on_short_detected    # HIGH 상태 (Short 감지)
        pin5.when_deactivated = _on_short_cleared   # LOW 상태 (Short 해제)
        
        print("[OK] GPIO5 이벤트 핸들러 등록 완료 (gpiozero) - Short 체크")
    except Exception as e:
        print(f"[ERROR] GPIO5 이벤트 설정 오류: {e}")

# GPIO11 이벤트 핸들러 설정 (gpiozero 방식)
if gpio_available and pin11:
    try:
        # 초기 니들팁 상태 설정 (is_active는 pull-up 상태에서 HIGH일 때 True)
        needle_tip_connected = pin11.is_active
        print(f"[GPIO11] 초기 니들팁 상태: {'연결됨' if needle_tip_connected else '분리됨'}")
        
        # 이벤트 핸들러 할당 (체결: HIGH, 분리: LOW)
        pin11.when_activated = _on_tip_connected
        pin11.when_deactivated = _on_tip_disconnected
        
        print("[OK] GPIO11 이벤트 핸들러 등록 완료 (gpiozero) - 니들팁 상태 감지")
    except Exception as e:
        print(f"[ERROR] GPIO11 이벤트 설정 오류: {e}")

# GPIO6 이벤트 핸들러 설정 (START 버튼 스위치)
if gpio_available and pin6:
    try:
        # GPIO6 초기 상태 확인
        print(f"[GPIO6] 초기 START 버튼 상태: {'눌림' if pin6.is_active else '안눌림'}")
        
        # 이벤트 핸들러 할당 (버튼 눌림: HIGH -> LOW 전환 시 트리거)
        pin6.when_activated = _on_start_button_pressed_sync
        
        print("[OK] GPIO6 이벤트 핸들러 등록 완료 (gpiozero) - START 버튼 스위치")
    except Exception as e:
        print(f"[ERROR] GPIO6 이벤트 설정 오류: {e}")


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
                print(f"[DEBUG] WebSocket 메시지 수신: {msg[:200]}...")  # 처음 200자만 출력
                data = json.loads(msg)
                print(f"[DEBUG] 파싱된 명령: {data.get('cmd', 'UNKNOWN')}")

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
                    motor_id = data.get("motor_id", 1)  # 기본값은 모터 1
                    
                        # WebSocket 메시지 수신 로그 (디버깅용)
                    print(f"[DEBUG] WebSocket move 명령 수신: motor_id={motor_id}, position={position}, mode={mode}")
                    print(f"[DEBUG] 전체 데이터: {data}")
                    
                    # 모터 이동 명령 처리
                    
                    if mode == "servo" or mode == "position":
                        if position is not None:
                            if motor_id == 2:
                                # 모터2는 speed_mode 사용
                                needle_speed = data.get("needle_speed", 1000)  # 기본 속도
                                
                                # 감속 관련 파라미터 추출
                                deceleration_enabled = data.get("deceleration_enabled", False)
                                deceleration_position = data.get("deceleration_position", 0)
                                deceleration_speed = data.get("deceleration_speed", 0)
                                
                                # 감속 파라미터 로그 출력
                                if deceleration_enabled:
                                    print(f"[INFO] 모터2 감속 파라미터 수신 - 목표위치: {position}, 속도: {needle_speed}, 감속활성화: {deceleration_enabled}, 감속위치: {deceleration_position}mm, 감속속도: {deceleration_speed}")
                                else:
                                    print(f"[INFO] 모터2 일반 이동 - 목표위치: {position}, 속도: {needle_speed}")
                                
                                result = motor.move_with_speed_motor2(
                                    speed=needle_speed, 
                                    position=position,
                                    deceleration_enabled=deceleration_enabled,
                                    deceleration_position=deceleration_position,
                                    deceleration_speed=deceleration_speed
                                )
                            else:
                                result = motor.move_to_position(position, mode)
                            print(f"[INFO] 모터{motor_id} 이동 결과: {result}")
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
                            if motor_id == 2:
                                result = motor.move_with_speed_motor2(speed, position)
                            else:
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
                            if motor_id == 2:
                                result = motor.move_with_speed_force_motor2(force, speed, position)
                            else:
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
                            if motor_id == 2:
                                result = motor.set_force_motor2(force)
                            else:
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
                    if gpio_available and pin5:
                        state_text = "HIGH" if pin5.is_active else "LOW"
                        print(f"[INFO] GPIO 5번 상태 (Short 체크): {state_text}")
                        await websocket.send(json.dumps({
                            "type": "gpio",
                            "pin": 5,
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
                        "type": "resistance",
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
                print(f"[ERROR] WebSocket 메시지 처리 중 에러: {str(e)}")
                print(f"[ERROR] 문제가 된 메시지: {message}")
                import traceback
                print(f"[ERROR] 상세 오류: {traceback.format_exc()}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "result": str(e)
                }))
    finally:
        connected_clients.discard(websocket)
        print("[INFO] 클라이언트 연결 해제됨")

async def push_motor_status():
    
    while True:
        await asyncio.sleep(0.005)
        if motor.is_connected():
            # GPIO 상태 읽기
            gpio5_state = "UNKNOWN"
            gpio11_state = "UNKNOWN"
            gpio6_state = "UNKNOWN"
            
            if gpio_available and pin5:
                # gpiozero Button 객체에서 상태 읽기 (is_active가 True이면 HIGH 상태)
                gpio5_state = "HIGH" if pin5.is_active else "LOW"
            
            if gpio_available and pin11:
                # gpiozero Button 객체에서 상태 읽기 (is_active가 True이면 HIGH 상태)
                gpio11_state = "HIGH" if pin11.is_active else "LOW"
            
            if gpio_available and pin6:
                # GPIO6 START 버튼 스위치 상태 읽기
                gpio6_state = "HIGH" if pin6.is_active else "LOW"
            # EEPROM 데이터는 GPIO11 인터럽트에서 관리되므로 전역 변수 사용
            # 모터 2 상태 가져오기
            motor2_status = motor.get_motor2_status()
            
            data = {
                "type": "status",
                "data": {
                    # Motor 1 상태 (기존 호환성)
                    "position": motor.position,
                    "force": motor.force,
                    "sensor": motor.sensor,
                    "setPos": motor.setPos,
                    # Motor 2 상태 추가
                    "motor2_position": motor2_status["position"],
                    "motor2_force": motor2_status["force"],
                    "motor2_sensor": motor2_status["sensor"],
                    "motor2_setPos": motor2_status["setPos"],
                    # 명령어 큐 상태 (디버깅용)
                    "command_queue_size": motor.get_queue_size(),
                    # GPIO 상태
                    "gpio5": gpio5_state,    # GPIO5 Short 체크 상태
                    "gpio11": gpio11_state,  # GPIO11 니들팁 연결 상태
                    "gpio6": gpio6_state,    # GPIO6 START 버튼 스위치 상태
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

def cleanup_gpio():
    """기존 GPIO 리소스 정리"""
    if gpio_available:
        try:
            if pin5:
                pin5.close()
            if pin11:
                pin11.close()
            if pin6:
                pin6.close()
            print("[OK] GPIO 리소스 정리 완료 (gpiozero)")
        except Exception as e:
            print(f"[ERROR] GPIO 정리 오류: {e}")


async def main():
    # 모터 상태 푸시 비동기 작업 시작
    asyncio.create_task(push_motor_status())
    
    # 웹소켓 서버 시작
    async with websockets.serve(handler, "0.0.0.0", 8765):
        print("[OK] 서버 시작 (ws://0.0.0.0:8765)")
        await asyncio.Future()  # 서버가 계속 실행되도록 유지

if __name__ == "__main__":
    import signal
    import sys
    
    def signal_handler(signum, frame):
        """시그널 핸들러 - 강제 종료 시에도 자원 정리"""
        print(f"\n[INFO] 시그널 {signum} 수신 - 프로그램 종료 중...")
        cleanup_gpio()
        if motor:
            motor.disconnect()
        sys.exit(0)
    
    # 시그널 핸들러 등록
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # 종료 시그널
    
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] 프로그램 종료 중...")
    except Exception as e:
        print(f"\n[ERROR] 예상치 못한 오류: {e}")
    finally:
        cleanup_gpio()