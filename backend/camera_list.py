"""
카메라 장치 목록을 JSON 형식으로 반환하는 스크립트
"""
import cv2
import json
import sys
import subprocess
import platform

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
    """사용 가능한 카메라 인덱스를 검색하고 상세 정보를 반환합니다."""
    available_cameras = []
    windows_devices = get_camera_devices_windows() if platform.system() == 'Windows' else []
    
    for i in range(limit):
        try:
            cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
            if cap.isOpened():
                # 실제 프레임을 읽을 수 있는지 확인
                ret, frame = cap.read()
                if ret and frame is not None:
                    # 카메라 정보 수집
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    fps = int(cap.get(cv2.CAP_PROP_FPS))
                    
                    # Windows 장치 정보와 매칭 시도
                    device_name = f"Camera {i}"
                    manufacturer = "Unknown"
                    device_id = ""
                    is_dino = False
                    
                    # 장치 정보 매칭 (VID 기반)
                    for device in windows_devices:
                        dev_id = device.get('DeviceID', '')
                        if 'VID_A168' in dev_id.upper():  # Dino-Lite VID
                            device_name = device.get('Name', device_name)
                            manufacturer = device.get('Manufacturer', manufacturer)
                            device_id = dev_id
                            is_dino = True
                            break
                    
                    # 모든 카메라 추가 (Dino가 아닌 것도 포함)
                    available_cameras.append({
                        'index': i,
                        'name': device_name,
                        'manufacturer': manufacturer,
                        'device_id': device_id,
                        'width': width,
                        'height': height,
                        'fps': fps,
                        'is_dino': is_dino
                    })
                    
                cap.release()
        except Exception as e:
            print(f"Error testing camera {i}: {e}", file=sys.stderr)
    
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
