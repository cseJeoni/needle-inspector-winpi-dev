"""
카메라 장치 목록을 JSON 형식으로 반환하는 스크립트
"""
import cv2
import json
import sys
import subprocess
import platform
import time

# 디버그 로그는 stderr로 출력하도록 print 함수 재정의
def debug_print(*args, **kwargs):
    """디버그 로그를 stderr로 출력"""
    print(*args, file=sys.stderr, **kwargs)

def get_camera_devices_windows():
    """Windows WMI를 사용하여 카메라 장치 정보를 조회합니다."""
    try:
        cmd = [
            'powershell', '-Command',
            '''Get-WmiObject -Class Win32_PnPEntity | Where-Object {
                $_.Name -like "*camera*" -or 
                $_.Name -like "*webcam*" -or 
                $_.Name -like "*video*" -or 
                $_.Name -like "*imaging*" -or
                $_.Name -like "*dino*" -or
                $_.ClassGuid -eq "{ca3e7ab9-b4c3-4ae6-8251-579ef933890f}" -or
                $_.Service -eq "usbvideo"
            } | Select-Object Name, DeviceID, Manufacturer, Service, ClassGuid, Status | ConvertTo-Json'''
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        if result.returncode == 0 and result.stdout.strip():
            devices = json.loads(result.stdout)
            if not isinstance(devices, list):
                devices = [devices]
            return devices
        else:
            return []
    except Exception as e:
        print(f"Error querying camera devices: {e}", file=sys.stderr)
        return []

def find_available_cameras(limit=10):
    """
    VID_A168 (Dino-Lite) 카메라의 실제 인덱스를 정확히 찾습니다.
    """
    debug_print("[INFO] Dino-Lite 카메라 (VID_A168) 검색 중...")
    devices = get_camera_devices_windows()
    available_cameras = []
    seen_signatures = set()  # 중복 제거용
    
    # VID_A168 장치만 필터링
    dino_devices = []
    for device in devices:
        device_id = device.get('DeviceID', '')
        # VID_A168이 있으면 Dino 장치
        if 'VID_A168' in device_id.upper():
            dino_devices.append(device)
            debug_print(f"[DEBUG] Dino 장치 발견: {device.get('Name', 'Unknown')} - {device_id[:50]}...")
    
    if not dino_devices:
        debug_print("[WARN] VID_A168 카메라 장치를 찾을 수 없습니다.")
        return []
    
    debug_print(f"[INFO] {len(dino_devices)}개의 Dino 카메라 장치 발견됨")

    try:
        # 모든 카메라 리소스 강제 해제 (다른 프로세스의 점유 해제)
        debug_print("[INFO] 모든 카메라 리소스 강제 해제 중...")
        for idx in range(limit):
            try:
                cap_release = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cap_release.isOpened():
                    cap_release.release()
                    debug_print(f"[DEBUG] 카메라 인덱스 {idx} 리소스 해제")
            except:
                pass
        
        # 리소스 완전 해제를 위한 충분한 대기
        debug_print("[INFO] 리소스 해제 대기 중 (3초)...")
        time.sleep(3.0)

        # Dino 카메라가 자주 있는 인덱스부터 검색 (뒤쪽부터)
        test_order = [2, 3, 4, 5, 6, 7, 8, 9, 0, 1]
        
        for index in test_order:
            cap = None
            try:
                debug_print(f"[DEBUG] 카메라 인덱스 {index} 테스트 중...")
                cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)

                if not cap.isOpened():
                    continue

                # 프레임 읽기
                ret, frame = cap.read()
                if not ret or frame is None:
                    continue

                # 해상도 확인
                height, width = frame.shape[:2]
                debug_print(f"[DEBUG] 카메라 인덱스 {index}: 해상도 {width}x{height}")
                
                # 평균 밝기 계산 (Dino 카메라 특성)
                mean_brightness = frame.mean()
                debug_print(f"[DEBUG] 카메라 인덱스 {index}: 평균 밝기 {mean_brightness:.1f}")
                
                # Dino 카메라 판별 기준:
                # 1. 해상도: 640x480, 1280x960, 1280x1024
                # 2. 밝기: 50-100 사이 (Dino LED 조명 특성)
                is_dino_resolution = (width == 640 and height == 480) or \
                                   (width == 1280 and height == 960) or \
                                   (width == 1280 and height == 1024)
                
                is_dino_brightness = 50 < mean_brightness < 100
                
                if not (is_dino_resolution and is_dino_brightness):
                    debug_print(f"[SKIP] 카메라 인덱스 {index}: Dino 특성 아님 (해상도: {is_dino_resolution}, 밝기: {is_dino_brightness})")
                    continue

                # 프레임 시그니처 생성 (중앙 100x100 영역의 평균값)
                center_x, center_y = width // 2, height // 2
                roi_size = 50  # 중앙에서 ±50 픽셀
                x1 = max(0, center_x - roi_size)
                y1 = max(0, center_y - roi_size)
                x2 = min(width, center_x + roi_size)
                y2 = min(height, center_y + roi_size)

                region = frame[y1:y2, x1:x2]
                signature = (width, height, int(region.mean()))

                debug_print(f"[DEBUG] 카메라 인덱스 {index}: 시그니처 {signature}")

                # 중복 체크
                if signature in seen_signatures:
                    debug_print(f"[SKIP] 카메라 인덱스 {index}: 중복된 카메라 (시그니처 일치)")
                    continue

                seen_signatures.add(signature)

                # 이 카메라는 Dino 해상도를 가지고 있음
                device_name = f'Dino-Lite Camera {len(available_cameras) + 1}'
                
                # Dino 장치 이름이 있으면 사용
                for device in dino_devices:
                    name = device.get('Name', '')
                    if 'dino' in name.lower():
                        device_name = name
                        break

                # 카메라 정보 추가
                camera_info = {
                    'index': index,
                    'name': device_name,
                    'width': width,
                    'height': height,
                    'is_dino': True
                }
                available_cameras.append(camera_info)
                debug_print(f"[OK] 카메라 인덱스 {index}: {device_name} ({width}x{height}) - 진짜 Dino 카메라 확인됨!")

                # Dino 카메라를 필요한 만큼 찾으면 종료
                if len(available_cameras) >= len(dino_devices):
                    debug_print(f"[INFO] 필요한 Dino 카메라 {len(dino_devices)}개 모두 찾음")
                    break

            except Exception as e:
                debug_print(f"[ERROR] 카메라 인덱스 {index} 테스트 중 오류: {e}")
            finally:
                if cap is not None:
                    cap.release()
                    time.sleep(0.3)  # 리소스 해제 대기

    finally:
        # 모든 카메라 리소스 완전 해제
        debug_print("[INFO] 모든 카메라 리소스 해제 중...")
        time.sleep(0.5)

    debug_print(f"[INFO] 총 {len(available_cameras)}개의 Dino 카메라 감지됨")
    # 인덱스 순서대로 정렬 (낮은 인덱스부터)
    available_cameras.sort(key=lambda x: x['index'])
    debug_print(f"[INFO] 정렬된 카메라 인덱스: {[cam['index'] for cam in available_cameras]}")
    return available_cameras

if __name__ == '__main__':
    try:
        cameras = find_available_cameras()
        result = {
            'success': True,
            'cameras': cameras,
            'count': len(cameras)
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'cameras': [],
            'count': 0
        }
        print(json.dumps(error_result, ensure_ascii=False))
        sys.exit(1)
