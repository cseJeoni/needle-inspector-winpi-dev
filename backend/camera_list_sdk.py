#!/usr/bin/env python3
"""
SDK를 사용한 Dino-Lite 카메라 자동 감지 스크립트
VID_A168을 가진 Dino-Lite 카메라의 실제 OpenCV 인덱스를 찾습니다.
"""

import sys
import os
import json
import cv2
import time

# PyInstaller 번들 환경 확인
if getattr(sys, 'frozen', False):
    # 번들된 실행파일에서 실행 중
    application_path = sys._MEIPASS
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))
else:
    # 개발 환경에서 실행 중
    application_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))

def debug_print(msg):
    """디버그 메시지를 stderr로 출력"""
    print(msg, file=sys.stderr, flush=True)

def find_dino_cameras_with_sdk():
    """SDK를 사용하여 Dino 카메라를 찾습니다."""
    try:
        from dnx64 import DNX64
        
        # DLL 경로 설정
        if getattr(sys, 'frozen', False):
            dll_path = os.path.join(sys._MEIPASS, 'pyDnx64v2', 'DNX64.dll')
        else:
            dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
        
        if not os.path.exists(dll_path):
            debug_print(f"[ERROR] DNX64.dll을 찾을 수 없습니다: {dll_path}")
            return []
        
        debug_print(f"[INFO] DNX64 SDK 사용 - DLL 경로: {dll_path}")
        
        # DNX64 초기화
        dnx = DNX64(dll_path)
        
        # SDK 초기화
        if not dnx.Init():
            debug_print("[ERROR] DNX64 SDK 초기화 실패")
            return []
        
        # 비디오 장치 개수 가져오기
        device_count = dnx.GetVideoDeviceCount()
        debug_print(f"[INFO] SDK에서 감지한 비디오 장치 개수: {device_count}")
        
        dino_indices = []
        
        # 각 장치 확인
        for i in range(device_count):
            try:
                # 장치 이름 가져오기
                device_name = dnx.GetVideoDeviceName(i)
                if device_name:
                    debug_print(f"[DEBUG] 장치 {i}: {device_name}")
                    
                    # Dino-Lite 이름 패턴 확인
                    if "dino" in device_name.lower():
                        debug_print(f"[INFO] Dino-Lite 카메라 발견! 인덱스: {i}, 이름: {device_name}")
                        dino_indices.append(i)
                        continue
                
                # Device ID로도 확인 (백업)
                dnx.SetVideoDeviceIndex(i)
                time.sleep(0.1)  # 장치 전환 대기
                
                device_id = dnx.GetDeviceId(i)
                if device_id:
                    debug_print(f"[DEBUG] 장치 {i} ID: {device_id}")
                    if "A168" in str(device_id):
                        debug_print(f"[INFO] VID_A168 장치 발견! 인덱스: {i}")
                        if i not in dino_indices:
                            dino_indices.append(i)
            except Exception as e:
                debug_print(f"[WARN] 장치 {i} 확인 중 오류: {e}")
                continue
        
        return dino_indices
        
    except ImportError as e:
        debug_print(f"[WARN] DNX64 SDK를 사용할 수 없습니다: {e}")
        return []
    except Exception as e:
        debug_print(f"[ERROR] SDK 사용 중 오류: {e}")
        return []

def verify_camera_with_opencv(index):
    """OpenCV로 카메라가 실제로 열리는지 확인"""
    try:
        debug_print(f"[DEBUG] OpenCV로 카메라 인덱스 {index} 확인 중...")
        cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        
        if not cap.isOpened():
            debug_print(f"[WARN] 카메라 인덱스 {index}: OpenCV로 열 수 없음")
            return False
        
        # 프레임 읽기 테스트
        ret, frame = cap.read()
        if not ret or frame is None:
            cap.release()
            debug_print(f"[WARN] 카메라 인덱스 {index}: 프레임을 읽을 수 없음")
            return False
        
        # 해상도 확인
        height, width = frame.shape[:2]
        debug_print(f"[INFO] 카메라 인덱스 {index}: 해상도 {width}x{height}")
        
        # Dino 카메라 해상도 확인
        is_dino_resolution = (width == 640 and height == 480) or \
                           (width == 1280 and height == 960) or \
                           (width == 1280 and height == 1024)
        
        cap.release()
        
        if is_dino_resolution:
            debug_print(f"[OK] 카메라 인덱스 {index}: Dino 해상도 확인됨")
            return True
        else:
            debug_print(f"[INFO] 카메라 인덱스 {index}: 비표준 해상도 ({width}x{height}) - 포함")
            return True  # SDK가 찾았으면 일단 포함
            
    except Exception as e:
        debug_print(f"[ERROR] 카메라 인덱스 {index} 확인 중 오류: {e}")
        return False

def find_available_cameras():
    """SDK와 OpenCV를 조합하여 Dino 카메라 찾기"""
    debug_print("[INFO] ========== Dino-Lite 카메라 검색 시작 ==========")
    
    # 먼저 SDK로 검색
    sdk_indices = find_dino_cameras_with_sdk()
    
    if sdk_indices:
        debug_print(f"[INFO] SDK에서 {len(sdk_indices)}개의 Dino 카메라 발견: {sdk_indices}")
        
        # OpenCV로 검증
        available_cameras = []
        for idx in sdk_indices:
            if verify_camera_with_opencv(idx):
                available_cameras.append({
                    "index": idx,
                    "name": f"Dino-Lite Camera {idx}",
                    "backend": "DSHOW"
                })
        
        debug_print(f"[INFO] 최종 {len(available_cameras)}개의 사용 가능한 Dino 카메라")
        return available_cameras
    else:
        debug_print("[WARN] SDK에서 Dino 카메라를 찾을 수 없음 - 폴백 모드로 전환")
        return fallback_camera_search()

def fallback_camera_search():
    """SDK 사용 불가 시 OpenCV로 직접 검색"""
    debug_print("[INFO] OpenCV 폴백 모드로 카메라 검색")
    available_cameras = []
    
    # 카메라 리소스 해제
    debug_print("[INFO] 모든 카메라 리소스 강제 해제 중...")
    for idx in range(10):
        try:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.release()
                debug_print(f"[DEBUG] 카메라 인덱스 {idx} 리소스 해제")
        except:
            pass
    
    time.sleep(2)  # 리소스 해제 대기
    
    # 0번 제외하고 검색 (웹캠 회피)
    test_order = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    
    for index in test_order:
        try:
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            
            if not cap.isOpened():
                continue
            
            ret, frame = cap.read()
            if not ret or frame is None:
                cap.release()
                continue
            
            height, width = frame.shape[:2]
            
            # Dino 카메라 해상도 확인
            is_dino_resolution = (width == 640 and height == 480) or \
                               (width == 1280 and height == 960) or \
                               (width == 1280 and height == 1024)
            
            cap.release()
            
            if is_dino_resolution:
                debug_print(f"[INFO] 카메라 인덱스 {index}: Dino 해상도 감지됨")
                available_cameras.append({
                    "index": index,
                    "name": f"Camera {index}",
                    "backend": "DSHOW"
                })
                
                if len(available_cameras) >= 2:  # 최대 2개만
                    break
        except:
            pass
    
    return available_cameras

def main():
    """메인 함수"""
    try:
        cameras = find_available_cameras()
        
        if len(cameras) >= 2:
            # 2개 이상 찾음
            result = {
                "success": True,
                "cameras": [cameras[0]["index"], cameras[1]["index"]],
                "count": 2
            }
        elif len(cameras) == 1:
            # 1개만 찾음
            result = {
                "success": True,
                "cameras": [cameras[0]["index"]],
                "count": 1
            }
        else:
            # 못 찾음
            result = {
                "success": True,
                "cameras": [],
                "count": 0
            }
        
        # JSON 출력
        print(json.dumps(result))
        
    except Exception as e:
        debug_print(f"[ERROR] 심각한 오류 발생: {e}")
        print(json.dumps({"success": False, "error": str(e), "cameras": [], "count": 0}))
        sys.exit(1)

if __name__ == "__main__":
    main()
