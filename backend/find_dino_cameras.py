"""
Dino-Lite 카메라의 정확한 인덱스를 찾는 스크립트
VID_A168 장치와 실제 카메라 인덱스를 매칭
"""
import cv2
import sys
import json
import time
import subprocess

def get_dino_devices():
    """Windows에서 VID_A168 장치 목록 가져오기"""
    try:
        cmd = [
            'powershell', '-Command',
            'Get-PnpDevice -Present | Where-Object { $_.DeviceID -like "*VID_A168*" -and $_.DeviceID -like "*MI_00*" } | Select-Object -ExpandProperty Name'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if result.returncode == 0 and result.stdout:
            devices = [line.strip() for line in result.stdout.split('\n') if line.strip()]
            return devices
        return []
    except:
        return []

def test_camera_for_dino_signature(index):
    """카메라가 Dino 특성을 가지는지 확인"""
    try:
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not cap.isOpened():
            return False, None
        
        # Dino 카메라 특성 확인
        # 1. 해상도 확인 (Dino는 주로 640x480 또는 1280x960)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # 2. 프레임 읽기 테스트
        ret, frame = cap.read()
        cap.release()
        
        if not ret or frame is None:
            return False, None
        
        # Dino 카메라의 전형적인 해상도
        is_dino_resolution = (width == 640 and height == 480) or \
                           (width == 1280 and height == 960) or \
                           (width == 1280 and height == 1024)
        
        return is_dino_resolution, (width, height)
    except:
        return False, None

def find_real_dino_cameras():
    """실제 Dino 카메라 인덱스 찾기"""
    print("[INFO] 실제 Dino-Lite 카메라 검색 시작...", file=sys.stderr)
    
    dino_devices = get_dino_devices()
    print(f"[INFO] Windows에서 {len(dino_devices)}개의 Dino 장치 발견", file=sys.stderr)
    for dev in dino_devices:
        print(f"  - {dev}", file=sys.stderr)
    
    if len(dino_devices) == 0:
        return []
    
    # 모든 카메라 인덱스를 먼저 해제
    print("[INFO] 모든 카메라 리소스 해제 중...", file=sys.stderr)
    for i in range(10):
        try:
            cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
            cap.release()
        except:
            pass
    
    time.sleep(2)  # 충분한 대기
    
    found_cameras = []
    tested_indices = []
    
    # Dino 카메라가 자주 있는 인덱스부터 확인
    # 보통 뒤쪽 인덱스에 있음
    test_order = [2, 3, 4, 5, 6, 7, 8, 9, 0, 1]
    
    for index in test_order:
        print(f"[DEBUG] 카메라 인덱스 {index} 테스트 중...", file=sys.stderr)
        is_dino, resolution = test_camera_for_dino_signature(index)
        
        if is_dino:
            print(f"[OK] 인덱스 {index}: Dino 카메라 특성 확인됨 - {resolution}", file=sys.stderr)
            found_cameras.append({
                'index': index,
                'name': f'Dino-Lite Camera {len(found_cameras) + 1}',
                'width': resolution[0],
                'height': resolution[1],
                'is_dino': True
            })
            
            if len(found_cameras) >= len(dino_devices):
                print(f"[INFO] 필요한 Dino 카메라 모두 찾음", file=sys.stderr)
                break
        else:
            print(f"[SKIP] 인덱스 {index}: Dino 특성 없음", file=sys.stderr)
        
        time.sleep(0.5)  # 각 테스트 사이 대기
    
    return found_cameras

if __name__ == '__main__':
    try:
        cameras = find_real_dino_cameras()
        result = {
            'success': True,
            'cameras': cameras,
            'count': len(cameras)
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e),
            'cameras': [],
            'count': 0
        }))
