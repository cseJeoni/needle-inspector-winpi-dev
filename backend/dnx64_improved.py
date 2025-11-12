#!/usr/bin/env python3
"""
기존 dnx64.py를 감싸는 안전한 래퍼 클래스
리소스 관리와 핫플러그 지원 추가
"""

import time
import atexit
import threading
from typing import Optional, Dict, List
import logging
import os
import sys

# PyInstaller 번들 환경 확인 및 경로 설정
if getattr(sys, 'frozen', False):
    # 번들된 실행파일에서 실행 중
    application_path = sys._MEIPASS
    sys.path.insert(0, os.path.join(application_path, 'pyDnx64v2'))
else:
    # 개발 환경에서 실행 중
    application_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(application_path, 'pyDnx64v2'))

# 기존 dnx64 모듈 import
from dnx64 import DNX64

# 로깅 설정 (stderr로 출력하여 stdout JSON과 분리)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


class SafeDNX64Manager:
    """기존 DNX64를 감싸는 안전한 매니저 - 싱글톤 패턴"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if hasattr(self, '_initialized'):
            return
        self._initialized = True
        
        self.dnx: Optional[DNX64] = None
        self.is_initialized = False
        self.device_states = {}  # 각 디바이스의 상태 추적
        self.connected_devices = []
        self._cleanup_registered = False
        
        # DLL 경로 설정
        if getattr(sys, 'frozen', False):
            self.dll_path = os.path.join(sys._MEIPASS, 'pyDnx64v2', 'DNX64.dll')
        else:
            self.dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
    
    def initialize(self) -> bool:
        """SDK 초기화 - 정확한 순서 준수"""
        if self.is_initialized:
            logger.debug("SDK already initialized")
            return True
        
        try:
            # 1. DNX64 객체 생성
            self.dnx = DNX64(self.dll_path)
            
            # 2. Init 호출 (SDK 레퍼런스: 반드시 첫 번째로 호출)
            result = self.dnx.Init()
            if not result:
                logger.error("SDK Init() failed - 카메라가 연결되어 있는지 확인하세요")
                return False
            
            self.is_initialized = True
            logger.info("DNX64 SDK initialized successfully")
            
            # 3. atexit 등록 (프로그램 비정상 종료 대비)
            if not self._cleanup_registered:
                atexit.register(self.cleanup)
                self._cleanup_registered = True
            
            # 4. 연결된 디바이스 검색
            self.scan_devices()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize SDK: {e}")
            self.is_initialized = False
            return False
    
    def scan_devices(self):
        """연결된 디바이스 검색"""
        if not self.is_initialized:
            return []
        
        self.connected_devices = []
        device_count = self.dnx.GetVideoDeviceCount()
        
        for i in range(device_count):
            try:
                device_name = self.dnx.GetVideoDeviceName(i)
                device_id = self.dnx.GetDeviceId(i)
                config = self.dnx.GetConfig(i)
                
                self.connected_devices.append({
                    'index': i,
                    'name': device_name,
                    'id': device_id,
                    'config': config
                })
                
                # 상태 초기화
                self.device_states[i] = {
                    'led_on': False,
                    'is_open': False
                }
                
                logger.info(f"Found device {i}: {device_name} (ID: {device_id})")
                
            except Exception as e:
                logger.error(f"Error scanning device {i}: {e}")
        
        return self.connected_devices
    
    def open_device(self, device_index: int) -> bool:
        """디바이스 열기 (LED 켜기)"""
        if not self.is_initialized:
            if not self.initialize():
                return False
        
        try:
            # 디바이스 인덱스 설정
            self.dnx.SetVideoDeviceIndex(device_index)
            
            # LED 켜기
            self.dnx.SetLEDState(device_index, 1)
            
            # 상태 업데이트
            if device_index in self.device_states:
                self.device_states[device_index]['is_open'] = True
                self.device_states[device_index]['led_on'] = True
            
            logger.info(f"Opened device {device_index}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to open device {device_index}: {e}")
            return False
    
    def close_device(self, device_index: int) -> bool:
        """디바이스 닫기 - 중요: 정확한 순서로 LED와 리소스 해제"""
        if not self.is_initialized:
            return False
        
        try:
            logger.debug(f"Closing device {device_index}...")
            
            # 1단계: LED 끄기 (SDK 레퍼런스: SetLEDState)
            self.dnx.SetLEDState(device_index, 0)
            logger.debug(f"LED OFF for device {device_index}")
            
            # 2단계: LED 상태 변경이 적용되도록 대기
            time.sleep(0.3)
            
            # 3단계: FLC가 있는 경우 FLC도 끄기
            device_info = next((d for d in self.connected_devices if d['index'] == device_index), None)
            if device_info:
                config = device_info.get('config', 0)
                has_flc = bool(config & 0x02)  # Bit 1: FLC supported
                
                if has_flc:
                    try:
                        self.dnx.SetFLCSwitch(device_index, 16)  # 16 = All LEDs off
                        logger.debug(f"FLC OFF for device {device_index}")
                        time.sleep(0.1)
                    except:
                        pass
            
            # 4단계: 상태 업데이트
            if device_index in self.device_states:
                self.device_states[device_index]['is_open'] = False
                self.device_states[device_index]['led_on'] = False
            
            logger.info(f"Closed device {device_index}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to close device {device_index}: {e}")
            return False
    
    def set_led(self, device_index: int, state: int) -> bool:
        """LED 상태 설정"""
        if not self.is_initialized:
            return False
        
        try:
            self.dnx.SetLEDState(device_index, state)
            
            if device_index in self.device_states:
                self.device_states[device_index]['led_on'] = (state > 0)
            
            logger.debug(f"Set LED {device_index} to state {state}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to set LED state: {e}")
            return False
    
    def cleanup(self):
        """완전한 리소스 정리 - 프로그램 종료 시 자동 호출"""
        logger.info("Starting SafeDNX64Manager cleanup...")
        
        if not self.is_initialized or not self.dnx:
            logger.debug("SDK not initialized, skipping cleanup")
            return
        
        try:
            # 모든 디바이스의 LED 끄기
            for device in self.connected_devices:
                device_index = device['index']
                logger.debug(f"Cleaning up device {device_index}")
                
                try:
                    # LED 끄기
                    self.dnx.SetLEDState(device_index, 0)
                    time.sleep(0.1)
                    
                    # FLC 끄기 (있는 경우)
                    config = device.get('config', 0)
                    if config & 0x02:  # FLC supported
                        self.dnx.SetFLCSwitch(device_index, 16)
                        time.sleep(0.1)
                        
                except Exception as e:
                    logger.error(f"Error cleaning device {device_index}: {e}")
            
            # 추가 대기 시간
            time.sleep(0.5)
            
            # SDK 객체 해제
            self.dnx = None
            self.is_initialized = False
            self.device_states.clear()
            
            logger.info("SafeDNX64Manager cleanup completed")
            
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
            self.dnx = None
            self.is_initialized = False

    def __del__(self):
        """소멸자에서도 cleanup 호출 (이중 안전장치)"""
        try:
            self.cleanup()
        except:
            pass


# 전역 매니저 인스턴스 getter
_manager_instance = None

def get_safe_manager() -> SafeDNX64Manager:
    """전역 SafeDNX64Manager 인스턴스 반환"""
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = SafeDNX64Manager()
    return _manager_instance


# 사용 예제 (테스트용 - 주석 처리됨)
# if __name__ == "__main__":
#     # 매니저 가져오기
#     manager = get_safe_manager()
#     
#     # 초기화
#     if manager.initialize():
#         print(f"Found {len(manager.connected_devices)} devices")
#         
#         # 첫 번째 디바이스 테스트
#         if manager.connected_devices:
#             idx = 0
#             
#             # 디바이스 열기
#             manager.open_device(idx)
#             print(f"Device {idx} opened, LED should be ON")
#             time.sleep(2)
#             
#             # LED 토글
#             manager.set_led(idx, 0)
#             print(f"LED OFF")
#             time.sleep(1)
#             
#             manager.set_led(idx, 1)
#             print(f"LED ON")
#             time.sleep(1)
#             
#             # 디바이스 닫기
#             manager.close_device(idx)
#             print(f"Device {idx} closed, LED should be OFF")
#     
#     # cleanup은 자동으로 호출됨 (atexit)
#     print("프로그램 종료 - 자동 cleanup이 실행됩니다")