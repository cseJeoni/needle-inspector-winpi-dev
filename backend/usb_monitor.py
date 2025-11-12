#!/usr/bin/env python3
"""
USB 카메라 핫플러그 감지 시스템
Windows WMI 이벤트와 폴링을 결합한 하이브리드 접근
"""

import time
import threading
import queue
from typing import Callable, Optional, Set
import logging

logger = logging.getLogger(__name__)

class USBHotplugMonitor:
    """USB 디바이스 연결/해제 감지"""
    
    def __init__(self, callback: Callable[[str, dict], None]):
        """
        Args:
            callback: 디바이스 변경 시 호출될 함수 (event_type, device_info)
        """
        self.callback = callback
        self.is_running = False
        self.monitor_thread = None
        self.polling_thread = None
        self.event_queue = queue.Queue()
        self.known_devices = set()
        
        # WMI 사용 가능 여부 확인
        self.wmi_available = self._check_wmi_available()
    
    def _check_wmi_available(self) -> bool:
        """WMI 사용 가능 여부 확인"""
        try:
            import wmi
            return True
        except ImportError:
            logger.warning("WMI not available, falling back to polling only")
            return False
    
    def start(self):
        """모니터링 시작"""
        if self.is_running:
            return
        
        self.is_running = True
        
        # 초기 디바이스 목록 가져오기
        self.known_devices = self._get_current_devices()
        
        # WMI 이벤트 모니터링 (Windows)
        if self.wmi_available:
            self.monitor_thread = threading.Thread(target=self._wmi_monitor, daemon=True)
            self.monitor_thread.start()
        
        # 폴링 기반 모니터링 (fallback)
        self.polling_thread = threading.Thread(target=self._polling_monitor, daemon=True)
        self.polling_thread.start()
        
        # 이벤트 처리 스레드
        self.event_thread = threading.Thread(target=self._process_events, daemon=True)
        self.event_thread.start()
        
        logger.info("USB Hotplug monitoring started")
    
    def stop(self):
        """모니터링 중지"""
        self.is_running = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=2)
        if self.polling_thread:
            self.polling_thread.join(timeout=2)
        logger.info("USB Hotplug monitoring stopped")
    
    def _get_current_devices(self) -> Set[str]:
        """현재 연결된 USB 카메라 디바이스 ID 목록"""
        devices = set()
        
        try:
            # 방법 1: DNX64 SDK 사용
            from dnx64_improved import get_safe_manager
            manager = get_safe_manager()
            if manager.initialize():
                count = manager.dnx.GetVideoDeviceCount()
                for i in range(count):
                    device_id = manager.dnx.GetDeviceId(i)
                    if device_id:
                        devices.add(device_id)
        except Exception as e:
            logger.error(f"Failed to get devices from SDK: {e}")
        
        try:
            # 방법 2: Windows Registry 확인 (fallback)
            import winreg
            
            # USB 디바이스 레지스트리 경로
            key_path = r"SYSTEM\CurrentControlSet\Enum\USB"
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path)
            
            for i in range(winreg.QueryInfoKey(key)[0]):
                try:
                    subkey_name = winreg.EnumKey(key, i)
                    # Dino-Lite 관련 VID/PID 확인
                    if "VID_0547" in subkey_name or "VID_A168" in subkey_name:
                        devices.add(subkey_name)
                except Exception:
                    pass
            
            winreg.CloseKey(key)
            
        except Exception as e:
            logger.error(f"Failed to read registry: {e}")
        
        return devices
    
    def _wmi_monitor(self):
        """WMI를 사용한 USB 이벤트 모니터링"""
        if not self.wmi_available:
            return
        
        try:
            import wmi
            c = wmi.WMI()
            
            # USB 디바이스 삽입 감지
            watcher_insert = c.Win32_DeviceChangeEvent.watch_for(
                EventType=2  # Device Arrival
            )
            
            # USB 디바이스 제거 감지  
            watcher_remove = c.Win32_DeviceChangeEvent.watch_for(
                EventType=3  # Device Removal
            )
            
            while self.is_running:
                try:
                    # 타임아웃으로 이벤트 대기
                    event = watcher_insert(timeout_ms=100)
                    if event:
                        self.event_queue.put(("device_added", event))
                    
                    event = watcher_remove(timeout_ms=100)
                    if event:
                        self.event_queue.put(("device_removed", event))
                        
                except wmi.x_wmi_timed_out:
                    continue
                except Exception as e:
                    logger.error(f"WMI monitor error: {e}")
                    time.sleep(1)
                    
        except Exception as e:
            logger.error(f"Failed to start WMI monitor: {e}")
    
    def _polling_monitor(self):
        """폴링 기반 USB 디바이스 변경 감지"""
        poll_interval = 1.0  # 1초마다 체크
        
        while self.is_running:
            try:
                current_devices = self._get_current_devices()
                
                # 새로 추가된 디바이스
                added = current_devices - self.known_devices
                for device_id in added:
                    self.event_queue.put(("device_added", {"id": device_id}))
                
                # 제거된 디바이스
                removed = self.known_devices - current_devices
                for device_id in removed:
                    self.event_queue.put(("device_removed", {"id": device_id}))
                
                # 디바이스 목록 업데이트
                self.known_devices = current_devices
                
            except Exception as e:
                logger.error(f"Polling monitor error: {e}")
            
            time.sleep(poll_interval)
    
    def _process_events(self):
        """이벤트 큐 처리"""
        while self.is_running:
            try:
                event_type, device_info = self.event_queue.get(timeout=0.5)
                
                # 디바운싱: 짧은 시간 내 중복 이벤트 제거
                time.sleep(0.5)
                
                # 콜백 호출
                if self.callback:
                    self.callback(event_type, device_info)
                    
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Event processing error: {e}")


class CameraHotplugHandler:
    """카메라 핫플러그 이벤트 처리"""
    
    def __init__(self):
        self.monitor = USBHotplugMonitor(self.handle_device_change)
        self.reconnect_attempts = {}
        self.max_reconnect_attempts = 3
    
    def handle_device_change(self, event_type: str, device_info: dict):
        """디바이스 변경 이벤트 처리"""
        logger.info(f"Device event: {event_type}, Info: {device_info}")
        
        if event_type == "device_added":
            self._handle_device_added(device_info)
        elif event_type == "device_removed":
            self._handle_device_removed(device_info)
    
    def _handle_device_added(self, device_info: dict):
        """디바이스 추가 처리"""
        device_id = device_info.get("id", "unknown")
        
        # 재연결 시도 횟수 초기화
        self.reconnect_attempts[device_id] = 0
        
        # 약간의 지연 후 SDK 재초기화
        time.sleep(2)
        
        try:
            from dnx64_improved import get_safe_manager
            manager = get_safe_manager()
            
            # DNX 매니저 재스캔
            if manager:
                manager.scan_devices()
                logger.info(f"Rescanned devices: {len(manager.connected_devices)} found")
            
            # 새 디바이스 자동 열기 (필요한 경우)
            device_count = manager.dnx.GetVideoDeviceCount()
            for i in range(device_count):
                if manager.dnx.GetDeviceId(i) == device_id:
                    manager.open_device(i)
                    logger.info(f"Opened newly connected device: {device_id}")
                    break
                    
        except Exception as e:
            logger.error(f"Failed to handle device addition: {e}")
    
    def _handle_device_removed(self, device_info: dict):
        """디바이스 제거 처리"""
        device_id = device_info.get("id", "unknown")
        
        try:
            from dnx64_improved import get_safe_manager
            manager = get_safe_manager()
            
            # 제거된 디바이스 닫기
            device_count = manager.dnx.GetVideoDeviceCount()
            for i in range(device_count):
                if manager.dnx.GetDeviceId(i) == device_id:
                    manager.close_device(i)
                    logger.info(f"Closed removed device: {device_id}")
                    break
            
            # DNX 매니저 재스캔
            manager.scan_devices()
            
        except Exception as e:
            logger.error(f"Failed to handle device removal: {e}")
    
    def start(self):
        """핫플러그 모니터링 시작"""
        self.monitor.start()
    
    def stop(self):
        """핫플러그 모니터링 중지"""
        self.monitor.stop()


# 사용 예제
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # 핫플러그 핸들러 시작
    handler = CameraHotplugHandler()
    handler.start()
    
    try:
        print("USB 카메라 핫플러그 모니터링 중...")
        print("카메라를 연결하거나 해제해보세요.")
        print("종료하려면 Ctrl+C를 누르세요.")
        
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n모니터링 중지...")
        handler.stop()