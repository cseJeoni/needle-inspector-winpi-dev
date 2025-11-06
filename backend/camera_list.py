#!/usr/bin/env python3
"""
SDK를 활용한 정확한 Dino-Lite 카메라 검색
SDK로 Dino 카메라를 찾고 OpenCV 인덱스를 매핑
"""

import sys
import os
import json
import cv2
import time

# PyInstaller 번들 환경 확인
if getattr(sys, 'frozen', False):
    application_path = sys._MEIPASS
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))
else:
    application_path = os.path.dirname(os.path.abspath(__file__))
    sys.path.append(os.path.join(application_path, 'pyDnx64v2'))

def debug_print(msg):
    """디버그 메시지를 stderr로 출력"""
    print(msg, file=sys.stderr, flush=True)

def find_dino_cameras_sdk():
    """SDK를 사용하여 Dino 카메라 찾기"""
    debug_print("[INFO] ========== DNX64 SDK로 Dino 카메라 검색 ==========")
    
    try:
        from dnx64 import DNX64
        
        # DLL 경로 설정
        if getattr(sys, 'frozen', False):
            dll_path = os.path.join(sys._MEIPASS, 'pyDnx64v2', 'DNX64.dll')
        else:
            dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
        
        if not os.path.exists(dll_path):
            debug_print(f"[ERROR] DNX64.dll 없음: {dll_path}")
            raise Exception("DNX64.dll을 찾을 수 없습니다")
        
        debug_print(f"[INFO] DNX64 DLL 경로: {dll_path}")
        
        # DNX64 초기화
        dnx = DNX64(dll_path)
        
        # SDK 초기화 - 연결된 모든 Dino 카메라 초기화
        init_result = dnx.Init()
        if not init_result:
            debug_print("[WARN] SDK Init 실패 - 카메라가 연결되지 않았을 수 있음")
            # Init 실패해도 계속 진행 (카메라가 없을 수도 있음)
        
        # Dino 카메라 개수 확인
        device_count = dnx.GetVideoDeviceCount()
        debug_print(f"[INFO] SDK 감지 Dino 카메라 수: {device_count}")
        
        if device_count == 0:
            debug_print("[ERROR] SDK가 Dino 카메라를 찾지 못함")
            raise Exception("Dino 카메라를 찾을 수 없습니다")
        
        # 각 Dino 카메라 정보 수집
        dino_devices = []
        for sdk_idx in range(device_count):
            device_name = dnx.GetVideoDeviceName(sdk_idx)
            if device_name:
                debug_print(f"[SDK] Dino 카메라 {sdk_idx}: {device_name}")
                dino_devices.append({
                    'sdk_index': sdk_idx,
                    'name': device_name
                })
        
        return dino_devices
        
    except Exception as e:
        debug_print(f"[ERROR] SDK 오류: {e}")
        raise

def map_sdk_to_opencv(dino_devices):
    """SDK 인덱스를 OpenCV 인덱스로 매핑"""
    debug_print("[INFO] SDK 인덱스를 OpenCV 인덱스로 매핑 중...")
    
    # 모든 카메라 리소스 해제
    for idx in range(10):
        try:
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.release()
        except:
            pass
    
    time.sleep(1)  # 리소스 해제 대기
    
    opencv_indices = []
    found_count = 0
    
    # OpenCV로 각 인덱스 테스트
    for idx in range(10):
        if found_count >= len(dino_devices):
            break  # 모든 Dino 카메라 찾음
        
        try:
            debug_print(f"[TEST] OpenCV 인덱스 {idx} 테스트...")
            cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            
            if not cap.isOpened():
                continue
            
            # 프레임 읽기
            ret, frame = cap.read()
            if ret and frame is not None:
                height, width = frame.shape[:2]
                debug_print(f"[OpenCV] 인덱스 {idx}: {width}x{height}")
                
                # Dino 카메라 특성 확인
                is_dino = False
                
                # 1. 해상도 체크 (Dino 카메라 특징적인 해상도)
                if (width == 640 and height == 480) or \
                   (width == 1280 and height == 960) or \
                   (width == 1280 and height == 1024) or \
                   (width == 2592 and height == 1944):  # 5MP
                    is_dino = True
                    debug_print(f"[OK] 인덱스 {idx}: Dino 해상도 매칭!")
                
                # 2. 밝기 패턴 체크 (Dino LED 특성)
                if is_dino:
                    mean_brightness = frame.mean()
                    debug_print(f"[INFO] 인덱스 {idx}: 평균 밝기 {mean_brightness:.1f}")
                    
                    # Dino 카메라는 LED 때문에 특정 밝기 범위
                    if 40 < mean_brightness < 200:
                        debug_print(f"[OK] 인덱스 {idx}: Dino 밝기 패턴!")
                    else:
                        is_dino = False
                
                if is_dino:
                    opencv_indices.append(idx)
                    found_count += 1
                    debug_print(f"[FOUND] Dino 카메라 매핑: SDK[{found_count-1}] -> OpenCV[{idx}]")
            
            cap.release()
            
        except Exception as e:
            debug_print(f"[WARN] 인덱스 {idx} 테스트 실패: {e}")
    
    if len(opencv_indices) < len(dino_devices):
        debug_print(f"[WARN] SDK는 {len(dino_devices)}개 찾았지만 OpenCV는 {len(opencv_indices)}개만 매핑")
    
    return opencv_indices

def main():
    """메인 함수"""
    try:
        # 1. SDK로 Dino 카메라 찾기
        dino_devices = find_dino_cameras_sdk()
        
        # 2. OpenCV 인덱스로 매핑
        opencv_indices = map_sdk_to_opencv(dino_devices)
        
        if len(opencv_indices) == 0:
            raise Exception("OpenCV 인덱스 매핑 실패")
        
        # 3. 결과 반환
        if len(opencv_indices) >= 2:
            result = {
                "success": True,
                "cameras": [opencv_indices[0], opencv_indices[1]],
                "count": 2
            }
        elif len(opencv_indices) == 1:
            # 1개만 찾음 - 에러
            raise Exception(f"Dino 카메라 1개만 발견: 인덱스 {opencv_indices[0]}")
        
        debug_print(f"[SUCCESS] Dino 카메라 인덱스: {result['cameras']}")
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
