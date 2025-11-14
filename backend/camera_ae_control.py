#!/usr/bin/env python3
"""
카메라 Auto Exposure 제어 스크립트
Electron에서 호출하여 DNX64 SDK를 통해 카메라 Auto Exposure를 제어합니다.
"""

import sys
import os
import argparse
import json

# PyInstaller 번들 환경 확인
if getattr(sys, 'frozen', False):
    # 번들된 실행파일에서 실행 중
    application_path = sys._MEIPASS
    # SDK 경로 추가
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))
else:
    # 개발 환경에서 실행 중
    application_path = os.path.dirname(os.path.abspath(__file__))
    # SDK 경로 추가
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))

try:
    from dnx64 import DNX64
    dnx64_available = True
except ImportError as e:
    dnx64_available = False
    print(f"ERROR: DNX64 SDK import 실패: {e}", file=sys.stderr)

def get_ae_state(device_index):
    """카메라 Auto Exposure 상태를 가져옵니다."""
    if not dnx64_available:
        return {"success": False, "error": "DNX64 SDK를 사용할 수 없습니다"}

    try:
        # DNX64 DLL 경로 설정
        if getattr(sys, 'frozen', False):
            # 번들된 실행파일 환경
            dll_path = os.path.join(sys._MEIPASS, 'pyDnx64v2', 'DNX64.dll')
        else:
            # 개발 환경
            dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')

        if not os.path.exists(dll_path):
            return {"success": False, "error": f"DNX64.dll을 찾을 수 없습니다: {dll_path}"}

        dnx = DNX64(dll_path)

        # SDK 초기화
        if not dnx.Init():
            return {"success": False, "error": "DNX64 SDK 초기화 실패"}

        # Auto Exposure 상태 가져오기 (0: OFF, 1: ON)
        ae_state = dnx.GetAutoExposure(device_index)

        return {
            "success": True,
            "device_index": device_index,
            "ae_state": ae_state,
            "message": f"카메라 {device_index} Auto Exposure 상태: {'ON' if ae_state else 'OFF'}"
        }

    except Exception as e:
        return {"success": False, "error": f"Auto Exposure 상태 조회 실패: {str(e)}"}

def set_ae_state(device_index, ae_state):
    """카메라 Auto Exposure 상태를 설정합니다."""
    if not dnx64_available:
        return {"success": False, "error": "DNX64 SDK를 사용할 수 없습니다"}

    try:
        # DNX64 DLL 경로 설정
        if getattr(sys, 'frozen', False):
            # 번들된 실행파일 환경
            dll_path = os.path.join(sys._MEIPASS, 'pyDnx64v2', 'DNX64.dll')
        else:
            # 개발 환경
            dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')

        if not os.path.exists(dll_path):
            return {"success": False, "error": f"DNX64.dll을 찾을 수 없습니다: {dll_path}"}

        dnx = DNX64(dll_path)

        # SDK 초기화
        if not dnx.Init():
            return {"success": False, "error": "DNX64 SDK 초기화 실패"}

        # Auto Exposure 상태 설정 (0: OFF, 1: ON)
        dnx.SetAutoExposure(device_index, ae_state)

        return {
            "success": True,
            "device_index": device_index,
            "ae_state": ae_state,
            "message": f"카메라 {device_index} Auto Exposure {'ON' if ae_state else 'OFF'} 설정 완료"
        }

    except Exception as e:
        return {"success": False, "error": f"Auto Exposure 제어 실패: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description='카메라 Auto Exposure 제어')
    parser.add_argument('command', choices=['get', 'set'], help='실행할 명령')
    parser.add_argument('--device-index', type=int, help='카메라 디바이스 인덱스')
    parser.add_argument('--ae-state', type=int, choices=[0, 1], help='Auto Exposure 상태 (0: OFF, 1: ON)')

    args = parser.parse_args()

    if args.command == 'get':
        if args.device_index is None:
            result = {"success": False, "error": "get 명령에는 --device-index가 필요합니다"}
        else:
            result = get_ae_state(args.device_index)
    elif args.command == 'set':
        if args.device_index is None or args.ae_state is None:
            result = {"success": False, "error": "set 명령에는 --device-index와 --ae-state가 필요합니다"}
        else:
            result = set_ae_state(args.device_index, args.ae_state)
    else:
        result = {"success": False, "error": "알 수 없는 명령"}

    # 결과를 JSON으로 출력
    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    main()
