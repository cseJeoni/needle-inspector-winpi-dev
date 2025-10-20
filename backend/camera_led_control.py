#!/usr/bin/env python3
"""
카메라 LED 제어 스크립트
Electron에서 호출하여 DNX64 SDK를 통해 카메라 LED를 제어합니다.
"""

import sys
import os
import argparse
import json

# DNX64 SDK 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'pyDnx64v2'))

try:
    from dnx64 import DNX64
    dnx64_available = True
except ImportError as e:
    dnx64_available = False
    print(f"ERROR: DNX64 SDK import 실패: {e}", file=sys.stderr)

def get_camera_devices():
    """연결된 카메라 디바이스 목록을 가져옵니다."""
    if not dnx64_available:
        return {"success": False, "error": "DNX64 SDK를 사용할 수 없습니다"}
    
    try:
        # DNX64 DLL 경로 (상대 경로로 설정)
        dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
        
        if not os.path.exists(dll_path):
            return {"success": False, "error": f"DNX64.dll을 찾을 수 없습니다: {dll_path}"}
        
        dnx = DNX64(dll_path)
        
        # SDK 초기화
        if not dnx.Init():
            return {"success": False, "error": "DNX64 SDK 초기화 실패"}
        
        # 연결된 카메라 디바이스 수 가져오기
        device_count = dnx.GetVideoDeviceCount()
        
        devices = []
        for i in range(device_count):
            try:
                device_name = dnx.GetVideoDeviceName(i)
                device_id = dnx.GetDeviceId(i)
                devices.append({
                    "index": i,
                    "name": device_name,
                    "id": device_id
                })
            except Exception as e:
                print(f"WARN: 디바이스 {i} 정보 가져오기 실패: {e}", file=sys.stderr)
        
        return {
            "success": True,
            "device_count": device_count,
            "devices": devices
        }
        
    except Exception as e:
        return {"success": False, "error": f"카메라 디바이스 조회 실패: {str(e)}"}

def set_led_state(device_index, led_state):
    """카메라 LED 상태를 설정합니다."""
    if not dnx64_available:
        return {"success": False, "error": "DNX64 SDK를 사용할 수 없습니다"}
    
    try:
        # DNX64 DLL 경로
        dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
        
        if not os.path.exists(dll_path):
            return {"success": False, "error": f"DNX64.dll을 찾을 수 없습니다: {dll_path}"}
        
        dnx = DNX64(dll_path)
        
        # SDK 초기화
        if not dnx.Init():
            return {"success": False, "error": "DNX64 SDK 초기화 실패"}
        
        # LED 상태 설정 (0: OFF, 1: ON)
        dnx.SetLEDState(device_index, led_state)
        
        return {
            "success": True,
            "device_index": device_index,
            "led_state": led_state,
            "message": f"카메라 {device_index} LED {'ON' if led_state else 'OFF'} 설정 완료"
        }
        
    except Exception as e:
        return {"success": False, "error": f"LED 제어 실패: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description='카메라 LED 제어')
    parser.add_argument('command', choices=['list', 'set'], help='실행할 명령')
    parser.add_argument('--device-index', type=int, help='카메라 디바이스 인덱스 (set 명령용)')
    parser.add_argument('--led-state', type=int, choices=[0, 1], help='LED 상태 (0: OFF, 1: ON)')
    
    args = parser.parse_args()
    
    if args.command == 'list':
        result = get_camera_devices()
    elif args.command == 'set':
        if args.device_index is None or args.led_state is None:
            result = {"success": False, "error": "set 명령에는 --device-index와 --led-state가 필요합니다"}
        else:
            result = set_led_state(args.device_index, args.led_state)
    else:
        result = {"success": False, "error": "알 수 없는 명령"}
    
    # 결과를 JSON으로 출력
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
