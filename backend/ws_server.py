import asyncio
import websockets
import json
import time
import sys
import os
from dual_motor_controller import DualMotorController
from resistance import measure_resistance_once  # 저항 측정 일회성 함수 import

# DNX64 SDK import (LED 제어용)
try:
    sys.path.append(os.path.join(os.path.dirname(__file__), 'pyDnx64v2'))
    from dnx64 import DNX64
    dnx64_available = True
    print("[OK] DNX64 SDK 사용 가능 (LED 제어 기능 활성화)")
except ImportError as e:
    dnx64_available = False
    DNX64 = None
    print(f"[WARN] DNX64 SDK import 실패: {e} (LED 제어 기능 비활성화)")

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
pin13 = None  # GPIO13 객체 (PASS 버튼 스위치용)
pin19 = None  # GPIO19 객체 (NG 버튼 스위치용)

# LED 상태 관리
current_led_color = 'off'  # 현재 LED 색상
current_judgment_color = None  # 판정 완료 시 색상

# LED GPIO 핀 (출력용)
led_blue = None   # GPIO17 - BLUE LED
led_red = None    # GPIO27 - RED LED  
led_green = None  # GPIO22 - GREEN LED

needle_tip_connected = False  # 니들팁 연결 상태 (전역 변수)
is_started = False  # 스타트 상태 (전역 변수) - 판정 버튼 활성화 여부
current_needle_state = "disconnected"  # 현재 니들 상태: "disconnected", "needle_short", "connected"
is_needle_short_fixed = False  # START 시점 니들 쇼트 고정 상태 (LED RED 유지용)
is_judgment_completed = False  # 판정 완료 상태 (PASS/NG 후 LED 고정용)
is_resistance_abnormal = False  # 저항 비정상 상태 (LED RED 유지용)
is_eeprom_failed = False  # EEPROM 실패 상태 (LED RED 유지용)
last_eeprom_data = {"success": False, "error": "니들팁이 연결되지 않음"}  # 마지막 EEPROM 상태

try:
    from gpiozero import DigitalInputDevice, Button, LED
    
    # GPIO5: Short 체크용 (Button 클래스, 인터럽트 지원)
    pin5 = Button(5, pull_up=True, bounce_time=0.05)
    
    # GPIO11: Button 클래스로 니들팁 연결 감지 (내부 풀업, 바운스 타임 지원)
    pin11 = Button(11, pull_up=True, bounce_time=0.05)
    
    # GPIO6: Button 클래스로 START 버튼 스위치 (내부 풀업, 바운스 타임 지원)
    pin6 = Button(6, pull_up=True, bounce_time=0.05)
    
    # GPIO13: Button 클래스로 PASS 버튼 스위치 (내부 풀업, 바운스 타임 지원)
    pin13 = Button(13, pull_up=True, bounce_time=0.05)
    
    # GPIO19: Button 클래스로 NG 버튼 스위치 (내부 풀업, 바운스 타임 지원)
    pin19 = Button(19, pull_up=True, bounce_time=0.05)
    
    # LED 초기화 (출력용)
    led_blue = LED(17)   # GPIO17 - BLUE LED
    led_red = LED(27)    # GPIO27 - RED LED
    led_green = LED(22)  # GPIO22 - GREEN LED
    
    # 초기 상태: 모든 LED OFF
    led_blue.off()
    led_red.off()
    led_green.off()
    
    gpio_available = True
    print("[OK] GPIO 5번, 11번, 6번, 13번, 19번 핀 초기화 완료 (gpiozero 라이브러리)")
    print("[OK] LED GPIO 17번(BLUE), 27번(RED), 22번(GREEN) 초기화 완료 - 모든 LED OFF")
    
    # 프로그램 시작 시 니들팁 상태 확인 및 LED 설정 (LED 함수 정의 후 호출)
except ImportError as ie:
    print(f"[ERROR] GPIO 모듈을 찾을 수 없습니다: {ie}. GPIO 기능이 비활성화됩니다.")
except Exception as e:
    print(f"[ERROR] GPIO 초기화 오류: {e}")

motor = DualMotorController()
connected_clients = {}  # 클라이언트별 Lock을 저장하기 위해 dict로 변경
main_event_loop = None  # 메인 이벤트 루프 저장용

# 프로그램 시작 시 니들팁 상태 확인 함수
def check_initial_needle_tip_state():
    """프로그램 시작 시 니들팁 상태를 확인하는 함수 (LED 제어 없음)"""
    global needle_tip_connected
    
    if not gpio_available or not pin11:
        print("[WARN] GPIO 기능이 비활성화되어 있어 니들팁 상태를 확인할 수 없습니다.")
        return
    
    try:
        # GPIO11 상태 읽기 (Button 클래스는 is_active 속성 사용)
        # 이벤트 핸들러와 동일한 로직: activated = 연결됨, deactivated = 분리됨
        is_tip_connected = pin11.is_active
        
        if is_tip_connected:
            needle_tip_connected = True
            print("[INIT] 니들팁이 이미 체결되어 있습니다 (LED는 클라이언트 연결 시 설정)")
        else:
            needle_tip_connected = False
            print("[INIT] 니들팁이 분리되어 있습니다 (LED는 클라이언트 연결 시 설정)")
            
    except Exception as e:
        print(f"[ERROR] 니들팁 초기 상태 확인 실패: {e}")

def is_needle_short():
    """현재 니들 쇼트 상태인지 확인"""
    if not gpio_available or not pin5:
        return False
    return pin5.is_active

def determine_led_color():
    """우선순위에 따라 LED 색상 결정
    
    우선순위:
    1. 판정 완료 상태 → 판정 결과 색상 유지 (최우선!)
    2. 에러 상태 (쇼트, 저항비정상, EEPROM 실패) → RED
    3. 니들 연결 안됨 → OFF
    4. 기본 상태 (정상 연결) → BLUE
    """
    # 🔑 우선순위 1: 판정 완료 상태 (최우선 - 다른 모든 상태보다 우선)
    if is_judgment_completed and current_judgment_color:
        print(f"[LED] 판정 완료 상태 유지: {current_judgment_color.upper()}")
        return current_judgment_color
    
    # 우선순위 2: 에러 상태 (니들팁 연결된 상태에서만 체크)
    if needle_tip_connected:
        # 저항 비정상
        if is_resistance_abnormal:
            print(f"[LED] 에러 상태: 저항 비정상")
            return 'red'
        
        # EEPROM 실패
        if is_eeprom_failed:
            print(f"[LED] 에러 상태: EEPROM 실패")
            return 'red'
        
        # 니들 쇼트 고정 상태
        if is_needle_short_fixed:
            print(f"[LED] 에러 상태: 니들 쇼트 (고정)")
            return 'red'
        
        # 실시간 니들 쇼트 감지
        if is_needle_short():
            print(f"[LED] 에러 상태: 니들 쇼트 (실시간)")
            return 'red'
    
    # 우선순위 3: 니들 연결 안됨
    if not needle_tip_connected:
        return 'off'
    
    # 우선순위 4: 기본 상태 (정상 연결)
    return 'blue'

def apply_led_state(reason="unknown"):
    """결정된 색상으로 LED 적용"""
    global current_led_color
    target_color = determine_led_color()
    
    if target_color != current_led_color:
        print(f"[LED] 색상 변경: {current_led_color} → {target_color} (이유: {reason})")
        
        if target_color == 'blue':
            set_led_blue_on()
        elif target_color == 'red':
            set_led_red_on()
        elif target_color == 'green':
            set_led_green_on()
        else:
            set_all_leds_off()
            
        current_led_color = target_color
    else:
        print(f"[LED] 색상 변경 없음: {current_led_color} (이유: {reason})")

def determine_needle_state(send_status_update=False):
    """GPIO11과 GPIO5 상태를 읽어서 니들 상태 결정 및 LED 적용
    
    Args:
        send_status_update (bool): True이면 상태 변경을 클라이언트에게 알림
    """
    global needle_tip_connected, current_needle_state
    
    if not gpio_available or not pin11 or not pin5:
        print("[WARN] GPIO 기능이 비활성화되어 있어 니들 상태를 확인할 수 없습니다.")
        return
    
    try:
        # 현재 두 핀의 상태를 동시에 읽기
        gpio11_state = pin11.is_active  # True: 니들팁 연결됨, False: 분리됨
        gpio5_state = pin5.is_active    # True: 쇼트 감지, False: 정상
        
        print(f"[GPIO_STATE] GPIO11: {'ON' if gpio11_state else 'OFF'}, GPIO5: {'HIGH' if gpio5_state else 'LOW'}")
        
        # 상태 결정 (LED 제어는 apply_led_state에서 우선순위 기반으로 처리)
        if not gpio11_state:
            # [P1] 니들팁 없음
            new_state = "disconnected"
            needle_tip_connected = False

            # 🔑 니들팁 분리 시 판정 상태 리셋
            if is_judgment_completed:
                print("[JUDGMENT] 니들팁 분리로 판정 상태 리셋")
                handle_judgment_reset()
            
            apply_led_state("needle disconnected")
            
        elif gpio11_state and gpio5_state:
            # [P2] 니들 쇼트
            new_state = "needle_short"
            needle_tip_connected = True
            apply_led_state("needle short detected")
                
        elif gpio11_state and not gpio5_state:
            # [P3] 정상 연결
            new_state = "connected"
            needle_tip_connected = True
            apply_led_state("needle detected")
            
        else:
            # 예상치 못한 상태
            print(f"[ERROR] 예상치 못한 GPIO 상태: GPIO11={gpio11_state}, GPIO5={gpio5_state}")
            return
        
        # 상태 변경 시에만 로그 출력
        if current_needle_state != new_state:
            print(f"[STATE_CHANGE] {current_needle_state} → {new_state}")
            current_needle_state = new_state
            
            # START 버튼 시에만 상태 변경을 클라이언트에게 알림
            if send_status_update:
                state_message = {
                    "type": "needle_state_change",
                    "data": {
                        "state": new_state,
                        "needle_tip_connected": needle_tip_connected,
                        "gpio11": gpio11_state,
                        "gpio5": gpio5_state,
                        "timestamp": time.time()
                    }
                }
                
                for ws, lock in connected_clients.copy().items():
                    try:
                        asyncio.run_coroutine_threadsafe(
                            _send_state_message(ws, lock, state_message),
                            main_event_loop
                        )
                    except Exception as e:
                        print(f"[WARN] 상태 변경 알림 전송 실패: {e}")
                        
                print(f"[STATUS_UPDATE] Status Panel에 상태 변경 알림: {new_state}")
            else:
                print(f"[NO_STATUS_UPDATE] 실시간 상태 변경 - Status Panel 알림 없음: {new_state}")
                    
    except Exception as e:
        print(f"[ERROR] 니들 상태 결정 실패: {e}")

async def _send_state_message(websocket, lock, message):
    """상태 변경 메시지를 클라이언트에게 전송"""
    try:
        async with lock:
            await websocket.send(json.dumps(message))
    except Exception as e:
        print(f"[ERROR] 상태 메시지 전송 실패: {e}")
        connected_clients.pop(websocket, None)

# LED 제어 함수들
def set_led_blue_on():
    """BLUE LED만 켜고 나머지는 끄기"""
    if not gpio_available:
        print("[ERROR] GPIO 기능이 비활성화되어 있습니다.")
        return
        
    if not led_blue:
        print("[ERROR] BLUE LED 객체가 초기화되지 않았습니다.")
        return
        
    try:
        if led_blue:
            led_blue.on()
        if led_red:
            led_red.off()
        if led_green:
            led_green.off()
        current_led_state = 'blue'
        print("[LED] BLUE LED ON, 나머지 OFF")
    except Exception as e:
        print(f"[ERROR] BLUE LED 제어 실패: {e}")
        import traceback
        print(f"[ERROR] 상세 오류: {traceback.format_exc()}")

def set_led_red_on():
    """RED LED만 켜고 나머지는 끄기"""
    print(f"[DEBUG] LED 제어 시도 - gpio_available: {gpio_available}, led_blue: {led_blue is not None}, led_red: {led_red is not None}, led_green: {led_green is not None}")
    
    if not gpio_available:
        print("[ERROR] GPIO 기능이 비활성화되어 있습니다.")
        return
        
    if not led_red:
        print("[ERROR] RED LED 객체가 초기화되지 않았습니다.")
        return
        
    try:
        if led_blue:
            led_blue.off()
        if led_red:
            led_red.on()
        if led_green:
            led_green.off()
        current_led_state = 'red'
        print("[LED] RED LED ON, 나머지 OFF")
    except Exception as e:
        print(f"[ERROR] RED LED 제어 실패: {e}")
        import traceback
        print(f"[ERROR] 상세 오류: {traceback.format_exc()}")

def set_led_green_on():
    """GREEN LED만 켜고 나머지는 끄기"""
    global current_led_state
    
    if not gpio_available:
        print("[ERROR] GPIO 기능이 비활성화되어 있습니다.")
        return
        
    if not led_green:
        print("[ERROR] GREEN LED 객체가 초기화되지 않았습니다.")
        return
        
    try:
        led_blue.off()
        led_red.off()
        led_green.on()
        current_led_state = 'green'
        print("[LED] GREEN LED ON, 나머지 OFF")
    except Exception as e:
        print(f"[ERROR] GREEN LED 제어 실패: {e}")
        import traceback
        print(f"[ERROR] 상세 오류: {traceback.format_exc()}")

def set_all_leds_off():
    """모든 LED 끄기"""
    global current_led_state
    
    if not gpio_available:
        print("[ERROR] GPIO 기능이 비활성화되어 있습니다.")
        return
        
    try:
        if led_blue:
            led_blue.off()
        if led_red:
            led_red.off()
        if led_green:
            led_green.off()
        current_led_state = 'off'
        print("[LED] 모든 LED OFF")
    except Exception as e:
        print(f"[ERROR] 모든 LED OFF 제어 실패: {e}")
        import traceback
        print(f"[ERROR] 상세 오류: {traceback.format_exc()}")

def get_led_status():
    """현재 LED 상태 반환"""
    if gpio_available and led_blue and led_red and led_green:
        try:
            return {
                "blue": led_blue.is_lit,
                "red": led_red.is_lit,
                "green": led_green.is_lit
            }
        except Exception as e:
            print(f"[ERROR] LED 상태 읽기 실패: {e}")
            return {"blue": False, "red": False, "green": False}
    return {"blue": False, "red": False, "green": False}

async def _send_state_message(websocket, lock, message):
    """상태 변경 메시지를 클라이언트에게 전송"""
    try:
        async with lock:
            await websocket.send(json.dumps(message))
    except Exception as e:
        print(f"[ERROR] 상태 메시지 전송 실패: {e}")
        connected_clients.pop(websocket, None)

# 프로그램 시작 시 니들 상태 초기화
if gpio_available:
    determine_needle_state()

# GPIO 인터럽트 핸들러들 - 모두 통합 상태 결정 함수 호출
def _on_gpio_change():
    """GPIO 상태 변경 시 호출되는 통합 핸들러"""
    print("[GPIO_INTERRUPT] GPIO 상태 변경 감지 - 상태 재평가 시작 (Status Panel 업데이트 없음)")
    determine_needle_state(send_status_update=False)

# 디버깅 패널용 GPIO 상태 알림 함수
async def _send_gpio_debug_message(pin, state):
    """디버깅 패널로 GPIO 상태 변경 알림"""
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": pin,
            "state": state,
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
        except Exception as e:
            print(f"[WARN] GPIO{pin} 상태 변경 알림 전송 실패: {e}")
            connected_clients.pop(ws, None)

# GPIO5 이벤트 핸들러 (통합 상태 결정 방식)
async def _on_gpio5_changed():
    """GPIO5 상태 변경 시 호출되는 이벤트 핸들러"""
    state = "HIGH" if pin5.is_active else "LOW"
    print(f"[GPIO5] 상태 변경: {state}")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    await _send_gpio_debug_message(5, state)
    
    # 통합 상태 결정 함수 호출 (Status Panel 업데이트 없음)
    determine_needle_state(send_status_update=False)

# GPIO11 이벤트 핸들러 (통합 상태 결정 방식)  
async def _on_gpio11_changed():
    """GPIO11 상태 변경 시 호출되는 이벤트 핸들러"""
    state = "ON" if pin11.is_active else "OFF"
    print(f"[GPIO11] 상태 변경: {state}")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    await _send_gpio_debug_message(11, state)
    
    # 통합 상태 결정 함수 호출 (Status Panel 업데이트 없음)
    determine_needle_state(send_status_update=False)

def _on_gpio5_changed_sync():
    """GPIO5 상태 변경 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_gpio5_changed(), 
            main_event_loop
        )

def _on_gpio11_changed_sync():
    """GPIO11 상태 변경 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_gpio11_changed(), 
            main_event_loop
        )

# GPIO6 이벤트 핸들러 (START 버튼 스위치)
async def _on_start_button_pressed():
    """GPIO6 START 버튼 스위치가 눌렸을 때 호출되는 이벤트 핸들러"""
    global is_started, is_judgment_completed, current_judgment_color
    
    # 니들팁 연결 상태 확인 - 니들팁이 없으면 동작 차단
    if not needle_tip_connected or current_needle_state == "disconnected":
        print("[GPIO6] START 버튼 차단 - 니들팁이 연결되지 않음")
        # LED 모두 OFF 유지
        set_all_leds_off()
        print("[GPIO6] 니들팁 없음 - 모든 LED OFF")
        
        # 디버깅 패널로만 GPIO 상태 변경 알림 (기능은 차단)
        gpio_message = {
            "type": "gpio_state_change",
            "data": {
                "pin": 6,
                "state": "HIGH",
                "timestamp": time.time()
            }
        }
        
        for ws, lock in connected_clients.copy().items():
            try:
                async with lock:
                    await ws.send(json.dumps(gpio_message))
            except Exception as e:
                print(f"[WARN] GPIO6 디버깅 신호 전송 실패: {e}")
                connected_clients.pop(ws, None)
        return
    
    # 니들팁이 연결된 경우에만 정상 동작
    # 스타트 상태 토글
    is_started = not is_started
    print(f"[GPIO6] START 버튼 스위치 눌림 - 스타트 상태: {'활성화' if is_started else '비활성화'}")
    
    # 🎯 모든 상태 초기화 (START 버튼 누를 때마다 항상 초기화)
    is_judgment_completed = False
    current_judgment_color = None
    is_needle_short_fixed = False
    is_resistance_abnormal = False
    is_eeprom_failed = False
    print("[GPIO6] 🔄 모든 상태 초기화 완료")
    
    # LED 제어는 determine_needle_state()에서 통합 관리하므로 여기서는 상태 재평가만 수행 (Status Panel 업데이트 없음)
    determine_needle_state(send_status_update=False)
    print("[GPIO6] START 상태 변경 후 니들 상태 재평가 완료")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 6,
            "state": "HIGH",
            "timestamp": time.time()
        }
    }
    
    # 모든 연결된 클라이언트에게 START 신호 전송
    start_message = {
        "type": "gpio_start_button",
        "data": {
            "triggered": True,
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
                await ws.send(json.dumps(start_message))
        except Exception as e:
            print(f"[WARN] GPIO6 START 신호 전송 실패: {e}")
            connected_clients.pop(ws, None)

async def _on_start_button_released():
    """GPIO6 START 버튼 스위치가 떼어졌을 때 호출되는 이벤트 핸들러"""
    print("[GPIO6] START 버튼 스위치 떼어짐 - 디버깅 패널 상태 업데이트")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 6,
            "state": "LOW",
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
        except Exception as e:
            print(f"[WARN] GPIO6 상태 변경 알림 전송 실패: {e}")
            connected_clients.pop(ws, None)

def _on_start_button_pressed_sync():
    """GPIO6 START 버튼 스위치 눌림 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_start_button_pressed(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

def _on_start_button_released_sync():
    """GPIO6 START 버튼 스위치 떼어짐 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_start_button_released(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

# GPIO13 이벤트 핸들러 (PASS 버튼 스위치)
async def _on_pass_button_pressed():
    """GPIO13 PASS 버튼 스위치가 눌렸을 때 호출되는 이벤트 핸들러"""
    print("[GPIO13] PASS 버튼 스위치 눌림")
    
    # 니들팁 연결 상태 확인 - 니들팁이 없으면 동작 차단
    if not needle_tip_connected or current_needle_state == "disconnected":
        print("[GPIO13] PASS 버튼 차단 - 니들팁이 연결되지 않음")
        # LED 모두 OFF 유지
        set_all_leds_off()
        print("[GPIO13] 니들팁 없음 - 모든 LED OFF")
        
        # 디버깅 패널로만 GPIO 상태 변경 알림 (기능은 차단)
        gpio_message = {
            "type": "gpio_state_change",
            "data": {
                "pin": 13,
                "state": "HIGH",
                "timestamp": time.time()
            }
        }
        
        for ws, lock in connected_clients.copy().items():
            try:
                async with lock:
                    await ws.send(json.dumps(gpio_message))
            except Exception as e:
                print(f"[WARN] GPIO13 디버깅 신호 전송 실패: {e}")
                connected_clients.pop(ws, None)
        return
    
    # 니들팁이 연결된 경우에만 정상 동작
    # LED 제어: 스타트 상태일 때만 GREEN LED ON
    if is_started:
        global is_judgment_completed, current_judgment_color
        is_judgment_completed = True
        current_judgment_color = 'green'
        apply_led_state("PASS button pressed")
        print("[GPIO13] ✅ PASS 판정 완료 - GREEN LED ON (유지)")
    else:
        print("[GPIO13] ⚠️ 스타트 상태 아님 - PASS 버튼 무시")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 13,
            "state": "HIGH",
            "timestamp": time.time()
        }
    }
    
    # 모든 연결된 클라이언트에게 PASS 신호 전송 (니들팁 연결된 경우에만)
    pass_message = {
        "type": "gpio_pass_button",
        "data": {
            "triggered": True,
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
                await ws.send(json.dumps(pass_message))
        except Exception as e:
            print(f"[WARN] GPIO13 PASS 신호 전송 실패: {e}")
            connected_clients.pop(ws, None)

async def _on_pass_button_released():
    """GPIO13 PASS 버튼 스위치가 떼어졌을 때 호출되는 이벤트 핸들러"""
    print("[GPIO13] PASS 버튼 스위치 떼어짐 - 디버깅 패널 상태 업데이트")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 13,
            "state": "LOW",
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
        except Exception as e:
            print(f"[WARN] GPIO13 상태 변경 알림 전송 실패: {e}")
            connected_clients.pop(ws, None)

def _on_pass_button_pressed_sync():
    """GPIO13 PASS 버튼 스위치 눌림 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_pass_button_pressed(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

def _on_pass_button_released_sync():
    """GPIO13 PASS 버튼 스위치 떼어짐 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_pass_button_released(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

# GPIO19 이벤트 핸들러 (NG 버튼 스위치)
async def _on_ng_button_pressed():
    """GPIO19 NG 버튼 스위치가 눌렸을 때 호출되는 이벤트 핸들러"""
    print("[GPIO19] NG 버튼 스위치 눌림")
    
    # 니들팁 연결 상태 확인 - 니들팁이 없으면 동작 차단
    if not needle_tip_connected or current_needle_state == "disconnected":
        print("[GPIO19] NG 버튼 차단 - 니들팁이 연결되지 않음")
        # LED 모두 OFF 유지
        set_all_leds_off()
        print("[GPIO19] 니들팁 없음 - 모든 LED OFF")
        
        # 디버깅 패널로만 GPIO 상태 변경 알림 (기능은 차단)
        gpio_message = {
            "type": "gpio_state_change",
            "data": {
                "pin": 19,
                "state": "HIGH",
                "timestamp": time.time()
            }
        }
        
        for ws, lock in connected_clients.copy().items():
            try:
                async with lock:
                    await ws.send(json.dumps(gpio_message))
            except Exception as e:
                print(f"[WARN] GPIO19 디버깅 신호 전송 실패: {e}")
                connected_clients.pop(ws, None)
        return
    
    # 니들팁이 연결된 경우에만 정상 동작
    # LED 제어: 스타트 상태일 때만 RED LED ON
    if is_started:
        global is_judgment_completed, current_judgment_color
        is_judgment_completed = True
        current_judgment_color = 'red'
        apply_led_state("NG button pressed")
        print("[GPIO19] ❌ NG 판정 완료 - RED LED ON (유지)")
    else:
        print("[GPIO19] ⚠️ 스타트 상태 아님 - NG 버튼 무시")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 19,
            "state": "HIGH",
            "timestamp": time.time()
        }
    }
    
    # 모든 연결된 클라이언트에게 NG 신호 전송 (니들팁 연결된 경우에만)
    ng_message = {
        "type": "gpio_ng_button",
        "data": {
            "triggered": True,
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
                await ws.send(json.dumps(ng_message))
        except Exception as e:
            print(f"[WARN] GPIO19 NG 신호 전송 실패: {e}")
            connected_clients.pop(ws, None)

async def _on_ng_button_released():
    """GPIO19 NG 버튼 스위치가 떼어졌을 때 호출되는 이벤트 핸들러"""
    print("[GPIO19] NG 버튼 스위치 떼어짐 - 디버깅 패널 상태 업데이트")
    
    # 디버깅 패널로 GPIO 상태 변경 알림
    gpio_message = {
        "type": "gpio_state_change",
        "data": {
            "pin": 19,
            "state": "LOW",
            "timestamp": time.time()
        }
    }
    
    for ws, lock in connected_clients.copy().items():
        try:
            async with lock:
                await ws.send(json.dumps(gpio_message))
        except Exception as e:
            print(f"[WARN] GPIO19 상태 변경 알림 전송 실패: {e}")
            connected_clients.pop(ws, None)

def _on_ng_button_pressed_sync():
    """GPIO19 NG 버튼 스위치 눌림 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_ng_button_pressed(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

def _on_ng_button_released_sync():
    """GPIO19 NG 버튼 스위치 떼어짐 동기 래퍼 함수"""
    if main_event_loop:
        asyncio.run_coroutine_threadsafe(
            _on_ng_button_released(), 
            main_event_loop
        )
    else:
        print("[ERROR] main_event_loop가 설정되지 않았습니다.")

# GPIO5 이벤트 핸들러 설정 (통합 상태 결정 방식)
if gpio_available and pin5:
    try:
        # GPIO5 초기 상태 확인
        initial_short_state = pin5.is_active
        print(f"[GPIO5] 초기 Short 체크 상태: {'SHORT (HIGH)' if initial_short_state else 'NORMAL (LOW)'}")
        
        # 통합 이벤트 핸들러 할당 (상태 변경 시 통합 상태 결정)
        pin5.when_activated = _on_gpio5_changed_sync    # HIGH 상태 (Short 감지)
        pin5.when_deactivated = _on_gpio5_changed_sync   # LOW 상태 (Short 해제)
        
        print("[OK] GPIO5 통합 이벤트 핸들러 등록 완료 - 우선순위 기반 상태 결정")
    except Exception as e:
        print(f"[ERROR] GPIO5 이벤트 설정 오류: {e}")

# GPIO11 이벤트 핸들러 설정 (통합 상태 결정 방식)
if gpio_available and pin11:
    try:
        print(f"[GPIO11] 현재 니들팁 상태: {'연결됨' if needle_tip_connected else '분리됨'}")
        
        # 통합 이벤트 핸들러 할당 (상태 변경 시 통합 상태 결정)
        pin11.when_activated = _on_gpio11_changed_sync    # HIGH 상태 (니들팁 연결)
        pin11.when_deactivated = _on_gpio11_changed_sync  # LOW 상태 (니들팁 분리)
        
        print("[OK] GPIO11 통합 이벤트 핸들러 등록 완료 - 우선순위 기반 상태 결정")
    except Exception as e:
        print(f"[ERROR] GPIO11 이벤트 설정 오류: {e}")

# GPIO6 이벤트 핸들러 설정 (START 버튼 스위치)
if gpio_available and pin6:
    try:
        # GPIO6 초기 상태 확인
        print(f"[GPIO6] 초기 START 버튼 상태: {'눌림' if pin6.is_active else '안눌림'}")
        
        # 이벤트 핸들러 할당
        pin6.when_activated = _on_start_button_pressed_sync    # 버튼 눌림
        pin6.when_deactivated = _on_start_button_released_sync # 버튼 떼어짐
        
        print("[OK] GPIO6 이벤트 핸들러 등록 완료 (gpiozero) - START 버튼 스위치")
    except Exception as e:
        print(f"[ERROR] GPIO6 이벤트 설정 오류: {e}")

# GPIO13 이벤트 핸들러 설정 (PASS 버튼 스위치)
if gpio_available and pin13:
    try:
        # GPIO13 초기 상태 확인
        print(f"[GPIO13] 초기 PASS 버튼 상태: {'눌림' if pin13.is_active else '안눌림'}")
        
        # 이벤트 핸들러 할당
        pin13.when_activated = _on_pass_button_pressed_sync    # 버튼 눌림
        pin13.when_deactivated = _on_pass_button_released_sync # 버튼 떼어짐
        
        print("[OK] GPIO13 이벤트 핸들러 등록 완료 (gpiozero) - PASS 버튼 스위치")
    except Exception as e:
        print(f"[ERROR] GPIO13 이벤트 설정 오류: {e}")

# GPIO19 이벤트 핸들러 설정 (NG 버튼 스위치)
if gpio_available and pin19:
    try:
        # GPIO19 초기 상태 확인
        print(f"[GPIO19] 초기 NG 버튼 상태: {'눌림' if pin19.is_active else '안눌림'}")
        
        # 이벤트 핸들러 할당
        pin19.when_activated = _on_ng_button_pressed_sync    # 버튼 눌림
        pin19.when_deactivated = _on_ng_button_released_sync # 버튼 떼어짐
        
        print("[OK] GPIO19 이벤트 핸들러 등록 완료 (gpiozero) - NG 버튼 스위치")
    except Exception as e:
        print(f"[ERROR] GPIO19 이벤트 설정 오류: {e}")


# EEPROM 관련 함수들 - 간소화된 API
def write_eeprom_mtr20(tip_type, shot_count, year, month, day, maker_code, country="CLASSYS", inspector_code=None, judge_result=None, daily_serial=None):
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
        inspector_code: 검사기 코드 (문자열, 선택적)
        judge_result: 판정 결과 (PASS=1, NG=0, 선택적)
        daily_serial: 일일 시리얼 번호 (정수, 선택적)
    
    EEPROM 설정:
        - CLASSYS: 주소 0x50, 오프셋 0x10
        - CUTERA: 주소 0x50, 오프셋 0x80
    
    레이아웃:
        offset + 0: TIP TYPE (1바이트)
        offset + 1~2: SHOT COUNT (2바이트, big-endian)
        offset + 3~4: Reserved
        offset + 5: 검사기 코드 (1바이트)
        offset + 6: 판정 결과 (1바이트: PASS=0x01, NG=0x00)
        offset + 7~8: 일일 시리얼 번호 (2바이트, big-endian)
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

        # 검사기 코드 (offset + 5) - 문자열을 ASCII 값으로 변환
        if inspector_code is not None:
            inspector_byte = ord(inspector_code[0]) if inspector_code else 0x41  # 기본값 'A'
            bus.write_byte_data(eeprom_address, offset + 5, inspector_byte & 0xFF)
            time.sleep(0.01)

        # 판정 결과 (offset + 6)
        if judge_result is not None:
            judge_byte = 0x01 if judge_result == "PASS" else 0x00
            bus.write_byte_data(eeprom_address, offset + 6, judge_byte)
            time.sleep(0.01)

        # 일일 시리얼 번호 (offset + 7~8) - 2바이트 big-endian
        if daily_serial is not None:
            bus.write_byte_data(eeprom_address, offset + 7, (daily_serial >> 8) & 0xFF)
            time.sleep(0.01)
            bus.write_byte_data(eeprom_address, offset + 8, daily_serial & 0xFF)
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
                "inspectorCode": inspector_char,
                "judgeResult": judge_str,
                "dailySerial": daily_serial,
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


def write_eeprom_mtr40(tip_type, shot_count, year, month, day, maker_code, inspector_code=None, judge_result=None, daily_serial=None):
    """
    MTR 4.0용 EEPROM 쓰기 함수
    
    Args:
        tip_type: TIP ID (1바이트)
        shot_count: Shot Count (2바이트)
        year: 제조 년도
        month: 제조 월
        day: 제조 일
        maker_code: 제조업체 코드 (1바이트)
        inspector_code: 검사기 코드 (문자열, 선택적)
        judge_result: 판정 결과 (PASS=1, NG=0, 선택적)
        daily_serial: 일일 시리얼 번호 (정수, 선택적)
    
    EEPROM 설정: 주소 0x51, 오프셋 0x70
    
    레이아웃:
        offset + 0: TIP TYPE (1바이트)
        offset + 1~2: SHOT COUNT (2바이트, big-endian)
        offset + 3~4: Reserved
        offset + 5: 검사기 코드 (1바이트)
        offset + 6: 판정 결과 (1바이트: PASS=0x01, NG=0x00)
        offset + 7~8: 일일 시리얼 번호 (2바이트, big-endian)
        offset + 9~11: 제조 년/월/일 (3바이트)
        offset + 12: 제조업체 (1바이트)
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

        # 검사기 코드 (offset + 5) - 문자열을 ASCII 값으로 변환
        if inspector_code is not None:
            inspector_byte = ord(inspector_code[0]) if inspector_code else 0x41  # 기본값 'A'
            bus.write_byte_data(eeprom_address, offset + 5, inspector_byte & 0xFF)
            time.sleep(0.01)

        # 판정 결과 (offset + 6)
        if judge_result is not None:
            judge_byte = 0x01 if judge_result == "PASS" else 0x00
            bus.write_byte_data(eeprom_address, offset + 6, judge_byte)
            time.sleep(0.01)

        # 일일 시리얼 번호 (offset + 7~8) - 2바이트 big-endian
        if daily_serial is not None:
            bus.write_byte_data(eeprom_address, offset + 7, (daily_serial >> 8) & 0xFF)
            time.sleep(0.01)
            bus.write_byte_data(eeprom_address, offset + 8, daily_serial & 0xFF)
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

            # 검사기 코드 (offset + 5)
            inspector_code = bus.read_byte_data(eeprom_address, offset + 5)
            inspector_char = chr(inspector_code) if 32 <= inspector_code <= 126 else 'A'

            # 판정 결과 (offset + 6)
            judge_result = bus.read_byte_data(eeprom_address, offset + 6)
            judge_str = "PASS" if judge_result == 0x01 else "NG"

            # 일일 시리얼 번호 (offset + 7~8)
            serial = bus.read_i2c_block_data(eeprom_address, offset + 7, 2)
            daily_serial = (serial[0] << 8) | serial[1]

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
                "inspectorCode": inspector_char,
                "judgeResult": judge_str,
                "dailySerial": daily_serial,
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

def handle_judgment_reset():
    """판정 완료 상태를 명시적으로 리셋하는 함수"""
    global is_judgment_completed, is_needle_short_fixed, is_resistance_abnormal, is_eeprom_failed
    is_judgment_completed = False
    is_needle_short_fixed = False
    is_resistance_abnormal = False
    is_eeprom_failed = False
    print("[JUDGMENT_RESET] 판정 완료 상태 및 모든 에러 상태 해제")
    
    # 현재 니들 상태에 따라 LED 재설정
    determine_needle_state(send_status_update=True)

async def handler(websocket):
    global is_started, is_judgment_completed, current_judgment_color, is_needle_short_fixed

    print("[INFO] 클라이언트 연결됨")
    connected_clients[websocket] = asyncio.Lock()  # Lock 객체 할당
    lock = connected_clients[websocket]  # Lock 변수 가져오기
    
    # 클라이언트 연결 시 니들팁 상태 확인 후 LED 설정
    if gpio_available and pin11:
        try:
            if needle_tip_connected:
                set_led_blue_on()
                print("[CLIENT_CONNECT] 니들팁 연결됨 - BLUE LED ON")
            else:
                set_all_leds_off()
                print("[CLIENT_CONNECT] 니들팁 분리됨 - 모든 LED OFF")
        except Exception as e:
            print(f"[ERROR] 클라이언트 연결 시 LED 설정 실패: {e}")
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
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "serial",
                            "result": result
                        }) + '\n')

                elif data["cmd"] == "disconnect":
                    result = motor.disconnect()
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "serial",
                            "result": result
                        }) + '\n')

                elif data["cmd"] == "move":
                    mode = data.get("mode", "servo")
                    position = data.get("position")
                    speed = data.get("speed")
                    needle_speed = data.get("needle_speed")  # 프론트엔드에서 보내는 속도값
                    force = data.get("force")
                    motor_id = data.get("motor_id", 1)  # 기본값은 모터 1
                    
                    # needle_speed가 있으면 speed로 사용하고 mode를 speed로 변경 (모터1, 모터2 통일)
                    if needle_speed is not None:
                        speed = needle_speed
                        mode = "speed"  # needle_speed가 있으면 자동으로 speed 모드로 변경
                        print(f"[DEBUG] 모터{motor_id} needle_speed 감지 - 속도: {speed}, 모드: {mode}로 자동 변경")
                    
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
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "serial",
                                    "result": result
                                }) + '\n')
                        else:
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "result": "위치 값이 없습니다."
                                }) + '\n')
                    
                    elif mode == "speed":
                        if speed is not None and position is not None:
                            if motor_id == 2:
                                # 모터2는 감속 파라미터도 함께 처리
                                deceleration_enabled = data.get("deceleration_enabled", False)
                                deceleration_position = data.get("deceleration_position", 0)
                                deceleration_speed = data.get("deceleration_speed", 0)
                                
                                # 감속 파라미터 로그 출력
                                if deceleration_enabled:
                                    print(f"[INFO] 모터2 감속 파라미터 수신 (speed 모드) - 목표위치: {position}, 속도: {speed}, 감속활성화: {deceleration_enabled}, 감속위치: {deceleration_position}mm, 감속속도: {deceleration_speed}")
                                else:
                                    print(f"[INFO] 모터2 일반 이동 (speed 모드) - 목표위치: {position}, 속도: {speed}")
                                
                                result = motor.move_with_speed_motor2(
                                    speed=speed, 
                                    position=position,
                                    deceleration_enabled=deceleration_enabled,
                                    deceleration_position=deceleration_position,
                                    deceleration_speed=deceleration_speed
                                )
                            else:
                                result = motor.move_with_speed(speed, position)
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "serial",
                                    "result": result
                                }) + '\n')
                        else:
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "result": "속도 또는 위치 값이 없습니다."
                                }) + '\n')
                    
                    elif mode == "speed_force":
                        if all(v is not None for v in [force, speed, position]):
                            if motor_id == 2:
                                result = motor.move_with_speed_force_motor2(force, speed, position)
                            else:
                                result = motor.move_with_speed_force(force, speed, position)
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "serial",
                                    "result": result
                                }) + '\n')
                        else:
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "result": "힘, 속도, 또는 위치 값이 없습니다."
                                }) + '\n')
                    
                    elif mode == "force":
                        if force is not None:
                            if motor_id == 2:
                                result = motor.set_force_motor2(force)
                            else:
                                result = motor.set_force(force)
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "serial",
                                    "result": result
                                }) + '\n')
                        else:
                            async with lock:
                                await websocket.send(json.dumps({
                                    "type": "error",
                                    "result": "힘 값이 없습니다."
                                }) + '\n')
                    
                    else:
                        async with lock:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": f"❌ 지원하지 않는 모드입니다: {mode}"
                            }) + '\n')

                elif data["cmd"] == "check":
                    connected = motor.is_connected()
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "serial",
                            "result": "연결됨" if connected else "연결 안됨"
                        }) + '\n')

                elif data["cmd"] == "gpio_read":
                    if gpio_available and pin5:
                        state_text = "HIGH" if pin5.is_active else "LOW"
                        print(f"[INFO] GPIO 5번 상태 (Short 체크): {state_text}")
                        async with lock:
                            await websocket.send(json.dumps({
                                "type": "gpio",
                                "pin": 5,
                                "state": state_text
                            }) + '\n')
                    else:
                        async with lock:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "GPIO 기능이 비활성화되어 있습니다."
                            }) + '\n')

                elif data["cmd"] == "eeprom_write":
                    tip_type = data.get("tipType")
                    shot_count = data.get("shotCount", 0)
                    year = data.get("year")
                    month = data.get("month")
                    day = data.get("day")
                    maker_code = data.get("makerCode")
                    mtr_version = data.get("mtrVersion", "2.0")  # 기본값: MTR 2.0
                    country = data.get("country", "CLASSYS")    # 기본값: CLASSYS
                    inspector_code = data.get("inspectorCode")    # 검사기 코드
                    judge_result = data.get("judgeResult")        # 판정 결과
                    daily_serial = data.get("dailySerial")        # 일일 시리얼
                    
                    print(f"[INFO] EEPROM 쓰기 요청: MTR={mtr_version}, 국가={country}, TIP_TYPE={tip_type}, SHOT_COUNT={shot_count}, DATE={year}-{month}-{day}, MAKER={maker_code}, INSPECTOR={inspector_code}, JUDGE={judge_result}, SERIAL={daily_serial}")
                    
                    if tip_type is None or year is None or month is None or day is None or maker_code is None:
                        async with lock:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "필수 데이터가 누락되었습니다."
                            }) + '\n')
                    else:
                        # MTR 버전과 국가에 따라 적절한 함수 선택
                        if mtr_version == "4.0":
                            result = write_eeprom_mtr40(tip_type, shot_count, year, month, day, maker_code, inspector_code, judge_result, daily_serial)
                        else:  # MTR 2.0
                            result = write_eeprom_mtr20(tip_type, shot_count, year, month, day, maker_code, country, inspector_code, judge_result, daily_serial)
                        
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
                                is_eeprom_failed = False
                                # LED 제어: EEPROM 저장 완료 시 초록불은 켜지 않음 (PASS 판정 시에만 초록불)
                            else:
                                print(f"[WARN] EEPROM 쓰기 후 읽기 실패: {read_result}")
                                is_eeprom_failed = True
                                # LED 제어: 스타트 상태일 때만 EEPROM 읽기 실패 시 apply_led_state 호출
                                if is_started:
                                    apply_led_state("EEPROM read after write failed")
                                    print("[EEPROM] 읽기 실패 - apply_led_state 호출")
                        else:
                            # LED 제어: 스타트 상태일 때만 EEPROM 저장 실패 시 apply_led_state 호출
                            is_eeprom_failed = True
                            if is_started:
                                apply_led_state("EEPROM write failed")
                                print("[EEPROM] 저장 실패 - apply_led_state 호출")
                        
                        async with lock:
                            await websocket.send(json.dumps({
                                "type": "eeprom_write",
                                "result": result
                            }) + '\n')

                elif data["cmd"] == "eeprom_read":
                    mtr_version = data.get("mtrVersion", "2.0")  # 기본값: MTR 2.0
                    country = data.get("country", "CLASSYS")    # 기본값: CLASSYS
                    
                    print(f"[INFO] EEPROM 읽기 요청: MTR={mtr_version}, 국가={country}")
                    
                    # MTR 버전과 국가에 따라 적절한 함수 선택
                    if mtr_version == "4.0":
                        result = read_eeprom_mtr40()
                    else:  # MTR 2.0
                        result = read_eeprom_mtr20(country)
                    
                    # LED 제어: EEPROM 읽기 실패 시 apply_led_state 호출
                    if not result.get("success"):
                        is_eeprom_failed = True
                        apply_led_state("EEPROM read failed")
                        print("[EEPROM] 읽기 실패 - apply_led_state 호출")
                    else:
                        is_eeprom_failed = False
                    
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "eeprom_read",
                            "result": result
                        }) + '\n')

                # 저항 측정 명령 (임시 연결/해제 방식)
                elif data["cmd"] == "measure_resistance":
                    print("[MainServer] 저항 측정 요청 수신")
                    
                    # 일회성 저항 측정 (연결 -> 측정 -> 즉시 해제)
                    result = measure_resistance_once(port="/dev/usb-resistance")
                    
                    # [수정] 프론트엔드에서 받은 임계값(Ohm) 사용, 기본 100 Ohm
                    resistance_threshold_ohm = data.get("threshold", 100)
                    resistance_threshold_mohm = resistance_threshold_ohm * 1000  # mOhm으로 변환
                    
                    global is_resistance_abnormal
                    is_abnormal = False
                    
                    if result.get("connected"):
                        res1_mohm = result.get("resistance1")
                        res2_mohm = result.get("resistance2")

                        print(f"[DEBUG] 저항 측정값: R1={res1_mohm} mΩ, R2={res2_mohm} mΩ (임계값: {resistance_threshold_mohm} mΩ)")

                        if res1_mohm is not None and res1_mohm > resistance_threshold_mohm:
                            is_abnormal = True
                            print(f"[LED] 저항 1 비정상 감지 ({res1_mohm}mΩ > {resistance_threshold_mohm}mΩ)")
                        
                        if res2_mohm is not None and res2_mohm > resistance_threshold_mohm:
                            is_abnormal = True
                            print(f"[LED] 저항 2 비정상 감지 ({res2_mohm}mΩ > {resistance_threshold_mohm}mΩ)")

                        if is_abnormal:
                            is_resistance_abnormal = True
                            if is_started:
                                apply_led_state("resistance abnormal")
                                print("[LED] 저항 비정상 - apply_led_state 호출")
                        else:
                            is_resistance_abnormal = False
                            print(f"[LED] 저항 정상 (Threshold: {resistance_threshold_mohm}mΩ)")
                    
                    else:
                        # 저항 측정기 연결 실패
                        is_abnormal = True
                        is_resistance_abnormal = True
                        if is_started:
                            apply_led_state("resistance meter connection failed")
                            print("[LED] 저항 측정기 연결 실패 - apply_led_state 호출")
                    
                    # 결과를 요청한 클라이언트에게 전송
                    response = {
                        "type": "resistance",
                        "data": result
                    }
                    async with lock:
                        await websocket.send(json.dumps(response) + '\n')
                    print(f"[MainServer] 저항 측정 결과 전송 완료 (비정상: {is_abnormal})")

                # LED 제어 명령
                elif data["cmd"] == "led_control":
                    led_type = data.get("type")
                    
                    if led_type == "red":
                        # NG 판정
                        is_judgment_completed = True
                        current_judgment_color = 'red'
                        apply_led_state("NG judgment")
                        
                    elif led_type == "green":
                        # PASS 판정
                        is_judgment_completed = True
                        current_judgment_color = 'green'
                        apply_led_state("PASS judgment")

                # START/STOP 상태 제어 명령
                elif data["cmd"] == "set_start_state":
                    new_state = data.get("state", False)
                    is_started = new_state
                
                    
                    if new_state:  # START 상태
                        # 🔄 새로운 사이클 시작 - 모든 상태 초기화
                        is_judgment_completed = False
                        current_judgment_color = None
                        is_needle_short_fixed = False
                        is_resistance_abnormal = False
                        is_eeprom_failed = False
                        print("[START_STATE] 🔄 새로운 사이클 시작 - 모든 상태 초기화")
                        determine_needle_state(send_status_update=True)
                    else:  # STOP 상태
                        # 🔄 STOP 시 모든 상태 초기화
                        is_needle_short_fixed = False
                        is_judgment_completed = False
                        current_judgment_color = None
                        is_resistance_abnormal = False
                        is_eeprom_failed = False
                        print("[START_STATE] 🔄 STOP 수신 - 모든 상태 초기화")
                        determine_needle_state(send_status_update=True)

                # 니들 쇼트 고정 상태 제어 명령
                elif data["cmd"] == "set_needle_short_fixed":
                    new_fixed_state = data.get("state", False)  # True: 고정, False: 해제
                    is_needle_short_fixed = new_fixed_state
                    print(f"[NEEDLE_SHORT_FIXED] 상태 변경: {'고정' if is_needle_short_fixed else '해제'}")
                    
                    # 상태 변경 후 니들 상태 재평가 (LED 제어만, Status Panel 업데이트 없음)
                    determine_needle_state(send_status_update=False)
                    
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "needle_short_fixed",
                            "result": {"success": True, "is_fixed": is_needle_short_fixed}
                        }) + '\n')

                # 판정 리셋 명령 (JudgePanel에서 판정 완료 후 호출)
                elif data["cmd"] == "judgment_reset":
                    handle_judgment_reset()
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "judgment_reset",
                            "result": {"success": True, "message": "판정 상태 리셋 완료"}
                        }) + '\n')

                else:
                    async with lock:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": "알 수 없는 명령어입니다."
                        }) + '\n')

            except Exception as e:
                print(f"[ERROR] WebSocket 메시지 처리 중 에러: {str(e)}")
                print(f"[ERROR] 문제가 된 메시지: {msg}")
                import traceback
                print(f"[ERROR] 상세 오류: {traceback.format_exc()}")
                async with lock:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "result": str(e)
                    }) + '\n')
    finally:
        connected_clients.pop(websocket, None)
        print("[INFO] 클라이언트 연결 해제됨")
        
        # 모든 클라이언트가 연결 해제되면 LED 끄기
        if not connected_clients:
            print("[INFO] 모든 클라이언트 연결 해제 - 모든 LED OFF")
            set_all_leds_off()

async def push_motor_status():
    """
    모터 상태를 지속적으로 읽고 WebSocket으로 전송하는 메인 루프
    예외 발생 시에도 루프가 중단되지 않도록 예외 처리 강화
    """
    consecutive_errors = 0
    max_consecutive_errors = 10  # 연속 10번 오류 시 복구 대기
    thread_check_counter = 0
    thread_check_interval = 50  # 5초마다 스레드 상태 확인 (100ms * 50)
    
    while True:
        try:
            # 주기적으로 모터 스레드 상태 확인
            thread_check_counter += 1
            if thread_check_counter >= thread_check_interval:
                thread_check_counter = 0
                if motor and motor.is_connected():
                    is_stuck, stuck_threads = motor.check_thread_health()
                    if is_stuck:
                        print(f"[SERVER_MONITOR] 모터 스레드 stuck 감지: {stuck_threads}")
                        print("[SERVER_MONITOR] 모터 스레드 강제 복구 시도...")
                        recovery_success = motor.force_recovery()
                        if recovery_success:
                            print("[SERVER_MONITOR] 모터 스레드 복구 성공")
                        else:
                            print("[SERVER_MONITOR] 모터 스레드 복구 실패")
            await asyncio.sleep(0.005)
            
            if not motor.is_connected():
                # 모터가 연결되지 않은 경우 대기
                await asyncio.sleep(0.1)
                continue
            
            # GPIO 상태는 인터럽트로만 처리하므로 폴링 제거
            # 디버깅 패널용 GPIO 상태는 gpio_state_change 메시지로 별도 전송
            
            # 모터 상태 읽기 (예외 처리 추가)
            try:
                motor2_status = motor.get_motor2_status()
            except Exception as e:
                print(f"[ERROR] 모터 2 상태 읽기 실패: {e}")
                motor2_status = {"position": 0, "force": 0, "sensor": 0, "setPos": 0}
            
            try:
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
                        # 니들팁 연결 상태 (GPIO11 기반)
                        "needle_tip_connected": needle_tip_connected,
                        # 스타트 상태 (판정 버튼 활성화 여부)
                        "is_started": is_started,
                    }
                }
            except Exception as e:
                print(f"[ERROR] 상태 데이터 생성 실패: {e}")
                continue

            # WebSocket 클라이언트에게 상태 전송
            if connected_clients:
                disconnected_clients = []
                for ws, lock in connected_clients.copy().items():
                    try:
                        message = json.dumps(data) + '\n'
                        async with lock:
                            await ws.send(message)
                    except websockets.exceptions.ConnectionClosed:
                        print(f"[INFO] 클라이언트 연결 종료 감지")
                        disconnected_clients.append(ws)
                    except Exception as e:
                        print(f"[WARN] 상태 전송 실패: {e}")
                        disconnected_clients.append(ws)
                
                # 연결이 끈어진 클라이언트 제거
                for ws in disconnected_clients:
                    connected_clients.pop(ws, None)
                
                # 모든 클라이언트가 연결 해제되면 LED 끄기
                if disconnected_clients and not connected_clients:
                    print("[INFO] 모든 클라이언트 연결 해제 - 모든 LED OFF")
                    set_all_leds_off()
            
            # 연속 오류 카운터 초기화
            consecutive_errors = 0
            
        except Exception as e:
            consecutive_errors += 1
            print(f"[ERROR] push_motor_status 루프 예외 발생 ({consecutive_errors}/{max_consecutive_errors}): {e}")
            
            # 연속 오류가 너무 많으면 대기 시간 증가
            if consecutive_errors >= max_consecutive_errors:
                print(f"[ERROR] 연속 오류 {max_consecutive_errors}회 초과 - 5초 대기 후 재시도")
                await asyncio.sleep(5)
                consecutive_errors = 0
            else:
                await asyncio.sleep(0.1)

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
            if pin13:
                pin13.close()
            if pin19:
                pin19.close()
            # LED 리소스 정리
            if led_blue:
                led_blue.close()
            if led_red:
                led_red.close()
            if led_green:
                led_green.close()
            print("[OK] GPIO 및 LED 리소스 정리 완료 (gpiozero)")
        except Exception as e:
            print(f"[ERROR] GPIO 정리 오류: {e}")

async def main():
    global main_event_loop  # 전역 변수 선언
    main_event_loop = asyncio.get_running_loop()  # 현재 루프를 캡처
    
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