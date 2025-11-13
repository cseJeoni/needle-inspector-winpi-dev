#!/usr/bin/env python3
"""
WMI를 사용하여 VID_A168 (Dino-Lite) 카메라만 정확히 찾고 OpenCV 인덱스 매핑
"""

import sys
import os
import json
import subprocess
import re
import cv2
import time

def debug_print(msg):
    """디버그 메시지를 stderr로 출력"""
    print(msg, file=sys.stderr, flush=True)

def get_camera_devices_from_wmi():
    """WMI로 모든 비디오 캡처 디바이스 정보 가져오기"""
    debug_print("[INFO] ========== WMI로 비디오 디바이스 검색 ==========")
    
    try:
        # PowerShell로 WMI 쿼리 실행
        powershell_cmd = """
        Get-WmiObject Win32_PnPEntity | 
        Where-Object {$_.PNPClass -eq 'Image' -or $_.PNPClass -eq 'Camera'} | 
        Select-Object Name, DeviceID, Status | 
        ConvertTo-Json -Compress
        """
        
        result = subprocess.run(
            ['powershell', '-Command', powershell_cmd],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            debug_print(f"[ERROR] PowerShell 실행 실패: {result.stderr}")
            return []
        
        output = result.stdout.strip()
        if not output:
            debug_print("[ERROR] WMI에서 디바이스를 찾지 못함")
            return []
        
        # JSON 파싱
        devices = json.loads(output)
        
        # 단일 디바이스인 경우 리스트로 변환
        if isinstance(devices, dict):
            devices = [devices]
        
        debug_print(f"[INFO] WMI에서 {len(devices)}개의 이미지 디바이스 발견")
        
        return devices
        
    except subprocess.TimeoutExpired:
        debug_print("[ERROR] WMI 쿼리 타임아웃")
        return []
    except json.JSONDecodeError as e:
        debug_print(f"[ERROR] JSON 파싱 실패: {e}")
        return []
    except Exception as e:
        debug_print(f"[ERROR] WMI 쿼리 오류: {e}")
        return []

def find_dino_cameras_from_wmi():
    """WMI에서 VID_A168인 Dino 카메라만 필터링"""
    debug_print("[INFO] ========== VID_A168 (Dino) 카메라 필터링 ==========")
    
    devices = get_camera_devices_from_wmi()
    
    if not devices:
        debug_print("[ERROR] 디바이스 목록이 비어있음")
        return []
    
    dino_cameras = []
    
    for device in devices:
        name = device.get('Name', '')
        device_id = device.get('DeviceID', '')
        status = device.get('Status', '')
        
        debug_print(f"[CHECK] {name}")
        debug_print(f"        DeviceID: {device_id[:80]}...")
        debug_print(f"        Status: {status}")
        
        # VID_A168 확인 (대소문자 무시)
        if 'VID_A168' in device_id.upper():
            debug_print(f"[FOUND] ✓ Dino 카메라 발견!")
            
            # PID도 추출
            pid_match = re.search(r'PID_([0-9A-Fa-f]{4})', device_id, re.IGNORECASE)
            pid = pid_match.group(1).upper() if pid_match else 'Unknown'
            
            dino_cameras.append({
                'name': name,
                'device_id': device_id,
                'vid': 'A168',
                'pid': pid,
                'status': status
            })
        else:
            debug_print(f"[SKIP] ✗ Dino가 아님 (VID_A168 없음)")
    
    debug_print(f"[INFO] 총 {len(dino_cameras)}개의 Dino 카메라 발견")
    return dino_cameras

def test_opencv_camera(idx):
    """OpenCV로 특정 인덱스의 카메라 테스트"""
    try:
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        
        if not cap.isOpened():
            return False, None
        
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return False, None
        
        height, width = frame.shape[:2]
        return True, {'width': width, 'height': height}
        
    except Exception as e:
        debug_print(f"[ERROR] 인덱스 {idx} 테스트 오류: {e}")
        return False, None

def map_dino_to_opencv_indices(dino_count):
    """OpenCV 인덱스를 테스트하여 Dino 카메라 개수만큼 매핑"""
    debug_print("[INFO] ========== OpenCV 인덱스 매핑 (Dino만) ==========")
    
    # 모든 카메라 리소스 해제
    for idx in range(10):
        try:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.release()
        except:
            pass
    
    time.sleep(1)
    
    dino_indices = []
    
    # 전체 카메라 목록 수집
    all_working_cameras = []
    for idx in range(10):
        debug_print(f"[TEST] OpenCV 인덱스 {idx} 테스트...")
        
        is_working, info = test_opencv_camera(idx)
        
        if is_working:
            debug_print(f"[OK] 인덱스 {idx}: {info['width']}x{info['height']} 작동")
            all_working_cameras.append(idx)
        else:
            debug_print(f"[SKIP] 인덱스 {idx}: 작동 안 함")
    
    debug_print(f"[INFO] 총 {len(all_working_cameras)}개의 작동하는 카메라 발견: {all_working_cameras}")
    debug_print(f"[INFO] 이 중 Dino는 {dino_count}개")
    
    # 작동하는 카메라 중 뒤에서부터 Dino로 가정
    # (일반적으로 웹캠이 인덱스 0, Dino가 1, 2)
    if len(all_working_cameras) >= dino_count:
        # 전략: 작동하는 카메라 목록에서 마지막 N개가 Dino
        # 또는 처음 N개를 건너뛰고 나머지가 Dino
        
        # 더 나은 방법: 모든 작동 카메라 중 처음부터 dino_count개 선택
        # (보통 시스템 순서가 웹캠 → Dino1 → Dino2)
        
        # 웹캠이 하나 있다고 가정하고 나머지가 Dino
        if len(all_working_cameras) == dino_count + 1:
            # 웹캠 1개 + Dino N개인 경우
            dino_indices = all_working_cameras[1:]  # 첫 번째 건너뛰기
            debug_print(f"[STRATEGY] 웹캠 1개 + Dino {dino_count}개 가정")
        elif len(all_working_cameras) == dino_count:
            # 정확히 Dino만 있는 경우
            dino_indices = all_working_cameras
            debug_print(f"[STRATEGY] Dino {dino_count}개만 있음")
        else:
            # 그 외: 처음 dino_count개 선택
            dino_indices = all_working_cameras[:dino_count]
            debug_print(f"[STRATEGY] 처음 {dino_count}개 선택")
    else:
        debug_print(f"[ERROR] 작동하는 카메라가 {len(all_working_cameras)}개뿐 (Dino {dino_count}개 필요)")
        dino_indices = all_working_cameras
    
    debug_print(f"[RESULT] Dino 카메라로 매핑된 인덱스: {dino_indices}")
    return dino_indices

def main():
    """메인 함수 - 1개 또는 2개 카메라 지원"""
    try:
        # 1. WMI로 VID_A168 카메라만 찾기
        dino_cameras = find_dino_cameras_from_wmi()

        if len(dino_cameras) == 0:
            raise Exception("WMI에서 Dino 카메라(VID_A168)를 찾을 수 없음")

        debug_print(f"[SUCCESS] WMI에서 {len(dino_cameras)}개의 Dino 카메라 확인")

        # 2. OpenCV 인덱스로 매핑
        camera_count = min(len(dino_cameras), 2)  # 최대 2개까지만
        opencv_indices = map_dino_to_opencv_indices(camera_count)

        if len(opencv_indices) == 0:
            raise Exception(f"OpenCV에서 카메라를 매핑할 수 없음")

        # 3. 결과 반환 (1개 또는 2개)
        cameras = []
        if len(opencv_indices) >= 1:
            cameras.append(opencv_indices[0])
        if len(opencv_indices) >= 2:
            cameras.append(opencv_indices[1])

        result = {
            "success": True,
            "cameras": cameras,
            "count": len(cameras)
        }

        if len(cameras) == 1:
            debug_print(f"[SUCCESS] Dino 카메라 1개 매핑: Camera1={opencv_indices[0]} (단일 카메라 모드)")
        else:
            debug_print(f"[SUCCESS] Dino 카메라 2개 매핑: Camera1={opencv_indices[0]}, Camera2={opencv_indices[1]} (2-카메라 모드)")

        print(json.dumps(result))

    except Exception as e:
        debug_print(f"[FATAL] 치명적 오류: {e}")
        error_result = {
            "success": False,
            "error": str(e),
            "cameras": [],
            "count": 0
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()