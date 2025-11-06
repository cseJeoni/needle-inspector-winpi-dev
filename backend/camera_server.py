from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import json
import threading
import time
import atexit
import signal
import platform
import subprocess
import os
import sys
import argparse

app = Flask(__name__)
CORS(app)

# 전역 카메라 객체
cap = None
cap2 = None

# 카메라 인덱스 (커맨드라인 인수로 받음)
camera_index_1 = None
camera_index_2 = None

# 종료 플래그
shutdown_flag = False

def get_camera_devices():
    """Windows WMI를 사용하여 카메라 장치 정보를 조회합니다."""
    try:
        # 더 포괄적인 PowerShell 명령어로 카메라 장치 정보 조회
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
                devices = [devices]  # 단일 객체인 경우 리스트로 변환
            
            print("[INFO] 발견된 카메라 장치:")
            for i, device in enumerate(devices):
                name = device.get('Name', 'Unknown')
                manufacturer = device.get('Manufacturer', 'Unknown')
                device_id = device.get('DeviceID', 'Unknown')
                service = device.get('Service', 'Unknown')
                class_guid = device.get('ClassGuid', 'Unknown')
                status = device.get('Status', 'Unknown')
                print(f"  [{i}] {name}")
                print(f"      제조사: {manufacturer}")
                print(f"      DeviceID: {device_id}")
                print(f"      Service: {service}")
                print(f"      ClassGuid: {class_guid}")
                print(f"      Status: {status}")
                print(f"      ---")
            
            return devices
        else:
            print("[WARN] 카메라 장치 정보를 조회할 수 없습니다.")
            return []
    except Exception as e:
        print(f"[ERROR] 카메라 장치 정보 조회 오류: {e}")
        return []

def filter_cameras_by_manufacturer(target_vids=None):
    """특정 Vendor ID의 카메라만 필터링합니다."""
    if target_vids is None:
        # Dino-Lite 카메라의 Vendor ID
        target_vids = ['A168']  # Dino-Lite VID
    
    devices = get_camera_devices()
    available_cameras = []
    
    print(f"[INFO] 카메라 필터링 중... (대상 VID: {target_vids})")
    
    # 실제 OpenCV로 테스트 가능한 카메라 인덱스 찾기
    for i in range(10):  # 최대 10개까지 테스트
        try:
            cap_test = cv2.VideoCapture(i, cv2.CAP_DSHOW)
            if cap_test.isOpened():
                # 실제 프레임을 읽을 수 있는지 확인
                ret, frame = cap_test.read()
                cap_test.release()
                
                if ret and frame is not None:
                    print(f"[DEBUG] 카메라 인덱스 {i}: 프레임 읽기 성공, 장치 매칭 시도 중...")
                    
                    # 모든 장치에서 VID 매칭 시도 (인덱스 순서와 무관하게)
                    matched_device = None
                    for device in devices:
                        device_id = device.get('DeviceID', '')
                        name = device.get('Name', '')
                        
                        # DeviceID에서 VID 추출 및 매칭
                        for target_vid in target_vids:
                            if f'VID_{target_vid}' in device_id.upper():
                                matched_device = device
                                print(f"[DEBUG] 카메라 인덱스 {i}: VID_{target_vid} 매칭됨 - {name}")
                                break
                        if matched_device:
                            break
                    
                    if matched_device:
                        available_cameras.append({
                            'index': i,
                            'name': matched_device.get('Name', f'Camera {i}'),
                            'manufacturer': matched_device.get('Manufacturer', 'Unknown'),
                            'device_id': matched_device.get('DeviceID', '')
                        })
                        print(f"[OK] 카메라 인덱스 {i}: {matched_device.get('Name')} - VID 매칭으로 사용 가능")
                    else:
                        # VID가 매칭되지 않는 경우
                        print(f"[SKIP] 카메라 인덱스 {i}: VID 매칭 실패 - 필터링됨")
                else:
                    print(f"[SKIP] 카메라 인덱스 {i}: 프레임 읽기 실패")
            else:
                print(f"[SKIP] 카메라 인덱스 {i}: 열기 실패")
        except Exception as e:
            print(f"[ERROR] 카메라 인덱스 {i} 테스트 중 오류: {e}")
    
    print(f"[INFO] 필터링된 사용 가능한 카메라: {[cam['index'] for cam in available_cameras]}")
    return available_cameras

def find_available_cameras(limit=10):
    """사용 가능한 카메라 인덱스를 검색합니다."""
    available_cameras = []
    print(f"[INFO] 최대 {limit}개의 인덱스에서 사용 가능한 카메라를 검색합니다...")
    for i in range(limit):
        try:
            cap_test = cv2.VideoCapture(i, cv2.CAP_DSHOW)
            if cap_test.isOpened():
                available_cameras.append(i)
                cap_test.release()
                print(f"[DEBUG] 카메라 인덱스 {i}번 사용 가능 확인")
        except Exception as e:
            print(f"[WARN] 카메라 인덱스 {i}번 테스트 중 오류: {e}")
    print(f"[INFO] 사용 가능한 카메라: {available_cameras}")
    return available_cameras

def initialize_cameras():
    """카메라 초기화 함수 - 커맨드라인 인수로 받은 카메라 인덱스 사용"""
    global cap, cap2, camera_index_1, camera_index_2
    
    print("[INFO] 카메라 초기화 시작...")
    print(f"[INFO] 지정된 카메라 인덱스: Camera 1={camera_index_1}, Camera 2={camera_index_2}")
    
    # 기존 카메라가 있다면 먼저 해제
    cleanup_cameras()
    
    # 잠시 대기 (리소스 완전 해제 시간 - DirectShow가 리소스를 해제하는 데 시간이 필요)
    print("[DEBUG] 카메라 리소스 해제 후 대기 중...")
    time.sleep(2.0)
    
    try:
        # 첫 번째 카메라 초기화
        if camera_index_1 is not None:
            cam_idx1 = camera_index_1
            print(f"[INFO] 첫 번째 카메라 (인덱스: {cam_idx1}) 초기화 중...")
            cap = cv2.VideoCapture(cam_idx1, cv2.CAP_DSHOW)
            if cap.isOpened():
                # 카메라 설정 적용
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap.set(cv2.CAP_PROP_FPS, 30)  # FPS 설정
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))  # MJPEG 코덱
                
                time.sleep(1.0)  # 카메라 안정화 대기 시간 증가
                
                # 워밍업: 몇 개의 더미 프레임 읽기
                print(f"[INFO] 카메라 {cam_idx1} 워밍업 중...")
                for i in range(5):
                    ret, _ = cap.read()
                    if ret:
                        print(f"[DEBUG] 카메라 {cam_idx1} 워밍업 프레임 {i+1}/5 성공")
                    else:
                        print(f"[WARN] 카메라 {cam_idx1} 워밍업 프레임 {i+1}/5 실패")
                    time.sleep(0.1)
                
                print(f"[OK] 카메라 (인덱스: {cam_idx1}) 초기화 완료")
            else:
                print(f"[ERROR] 카메라 (인덱스: {cam_idx1}) 초기화 실패")
                cap = None
        else:
            print("[ERROR] 첫 번째 카메라 인덱스가 지정되지 않았습니다.")
            cap = None

        # 두 번째 카메라 초기화
        if camera_index_2 is not None:
            cam_idx2 = camera_index_2
            print(f"[INFO] 두 번째 카메라 (인덱스: {cam_idx2}) 초기화 중...")
            cap2 = cv2.VideoCapture(cam_idx2, cv2.CAP_DSHOW)
            if cap2.isOpened():
                # 카메라 설정 적용
                cap2.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
                cap2.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
                cap2.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                cap2.set(cv2.CAP_PROP_FPS, 30)  # FPS 설정
                cap2.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc('M', 'J', 'P', 'G'))  # MJPEG 코덱
                
                time.sleep(1.0)  # 카메라 안정화 대기 시간 증가
                
                # 워밍업: 몇 개의 더미 프레임 읽기
                print(f"[INFO] 카메라 {cam_idx2} 워밍업 중...")
                for i in range(5):
                    ret, _ = cap2.read()
                    if ret:
                        print(f"[DEBUG] 카메라 {cam_idx2} 워밍업 프레임 {i+1}/5 성공")
                    else:
                        print(f"[WARN] 카메라 {cam_idx2} 워밍업 프레임 {i+1}/5 실패")
                    time.sleep(0.1)
                
                print(f"[OK] 카메라 (인덱스: {cam_idx2}) 초기화 완료")
            else:
                print(f"[ERROR] 카메라 (인덱스: {cam_idx2}) 초기화 실패")
                cap2 = None
        else:
            print("[INFO] 두 번째 카메라 인덱스가 지정되지 않았습니다.")
            cap2 = None
            
    except Exception as e:
        print(f"[ERROR] 카메라 초기화 오류: {e}")

def cleanup_cameras():
    """카메라 리소스 정리"""
    global cap, cap2
    
    print("[INFO] 카메라 리소스 정리 중...")
    try:
        # 첫 번째 카메라 해제
        if cap is not None:
            try:
                if cap.isOpened():
                    print("[DEBUG] 첫 번째 카메라 해제 시도...")
                    cap.release()
                    print("[OK] 첫 번째 카메라 해제 완료")
            except Exception as e:
                print(f"[WARN] 첫 번째 카메라 해제 중 오류: {e}")
            finally:
                cap = None
        
        # 리소스 해제 대기
        time.sleep(0.3)
        
        # 두 번째 카메라 해제
        if cap2 is not None:
            try:
                if cap2.isOpened():
                    print("[DEBUG] 두 번째 카메라 해제 시도...")
                    cap2.release()
                    print("[OK] 두 번째 카메라 해제 완료")
            except Exception as e:
                print(f"[WARN] 두 번째 카메라 해제 중 오류: {e}")
            finally:
                cap2 = None
        
        # OpenCV 리소스 완전 해제를 위한 대기
        print("[DEBUG] 카메라 리소스 완전 해제 대기 중...")
        time.sleep(0.5)
        print("[DEBUG] 카메라 리소스 완전 해제 대기 중...")
        time.sleep(0.5)
        
        # cv2.destroyAllWindows()는 GUI 관련이므로 서버에서는 불필요
        
        print("[OK] 카메라 리소스 정리 완료")
    except Exception as e:
        print(f"[ERROR] 카메라 리소스 정리 중 오류: {e}")
        # 오류가 발생해도 강제로 None 할당
        cap = None
        cap2 = None

def signal_handler(sig, frame):
    """시그널 핸들러 - 프로그램 종료 시 카메라 정리"""
    global shutdown_flag
    print("[INFO] 종료 신호 수신, 카메라 서버 종료 중...")
    shutdown_flag = True
    cleanup_cameras()
    print("[INFO] 카메라 서버 종료 완료")
    sys.exit(0)

# 시그널 핸들러 등록
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# 프로그램 종료 시 자동 정리
atexit.register(cleanup_cameras)

def generate_frames():
    global cap, shutdown_flag
    error_count = 0
    max_errors = 10
    frame_count = 0
    
    while not shutdown_flag:
        if cap is None or not cap.isOpened():
            print("[ERROR] 카메라 0번이 연결되지 않음")
            break
            
        try:
            # 항상 최신 프레임을 가져오기 위해 grab() 후 retrieve() 사용
            grab_success = cap.grab()
            if not grab_success:
                error_count += 1
                print(f"[ERROR] 카메라 0번에서 프레임 grab 실패 ({error_count}/{max_errors})")
                time.sleep(0.5)
                continue

            success, frame = cap.retrieve()
            if not success:
                error_count += 1
                print(f"[ERROR] 카메라 0번에서 프레임 읽기 실패 ({error_count}/{max_errors})")
                
                if error_count >= max_errors:
                    print("[ERROR] 카메라 0번 최대 오류 횟수 초과, 카메라 재초기화 시도")
                    initialize_cameras()
                    error_count = 0
                    time.sleep(2)
                    continue
                    
                time.sleep(0.5)
                continue
                
        except Exception as e:
            error_count += 1
            print(f"[ERROR] 카메라 0번 예외 발생 ({error_count}/{max_errors}): {e}")
            
            if error_count >= max_errors:
                print("[ERROR] 카메라 0번 최대 오류 횟수 초과, 카메라 재초기화 시도")
                initialize_cameras()
                error_count = 0
                time.sleep(2)
                continue
                
            time.sleep(0.5)
            continue

        # 성공적으로 프레임을 읽었으면 에러 카운터 리셋
        error_count = 0
        frame_count += 1
        
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            print("[ERROR] 카메라 0번 프레임 인코딩 실패")
            continue
            
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def generate_frames2():
    global cap2, shutdown_flag
    error_count = 0
    max_errors = 10
    frame_count = 0
    
    while not shutdown_flag:
        if cap2 is None or not cap2.isOpened():
            print("[ERROR] 카메라 2번이 연결되지 않음")
            break
            
        try:
            # 항상 최신 프레임을 가져오기 위해 grab() 후 retrieve() 사용
            grab_success = cap2.grab()
            if not grab_success:
                error_count += 1
                print(f"[ERROR] 카메라 2번에서 프레임 grab 실패 ({error_count}/{max_errors})")
                time.sleep(0.5)
                continue

            success, frame = cap2.retrieve()
            if not success:
                error_count += 1
                print(f"[ERROR] 카메라 2번에서 프레임 읽기 실패 ({error_count}/{max_errors})")
                
                if error_count >= max_errors:
                    print("[ERROR] 카메라 2번 최대 오류 횟수 초과, 카메라 재초기화 시도")
                    initialize_cameras()
                    error_count = 0
                    time.sleep(2)
                    continue
                    
                time.sleep(0.5)
                continue
                
        except Exception as e:
            error_count += 1
            print(f"[ERROR] 카메라 2번 예외 발생 ({error_count}/{max_errors}): {e}")
            
            if error_count >= max_errors:
                print("[ERROR] 카메라 2번 최대 오류 횟수 초과, 카메라 재초기화 시도")
                initialize_cameras()
                error_count = 0
                time.sleep(2)
                continue
                
            time.sleep(0.5)
            continue

        # 성공적으로 프레임을 읽었으면 에러 카운터 리셋
        error_count = 0
        frame_count += 1
        
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            print("[ERROR] 카메라 2번 프레임 인코딩 실패")
            continue
            
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

@app.route('/health')
def health():
    """서버 상태 확인용 헬스체크 엔드포인트"""
    return jsonify({'status': 'ok', 'message': 'Camera server is running'}), 200

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """서버를 안전하게 종료하는 엔드포인트"""
    print("[INFO] /shutdown 요청 수신, 서버를 안전하게 종료합니다.")
    
    # 응답을 먼저 보내고 종료 작업 수행
    def delayed_shutdown():
        import threading
        import time
        
        def shutdown_worker():
            time.sleep(0.1)  # 응답 전송 시간 확보
            print("[INFO] 카메라 리소스 정리 시작...")
            cleanup_cameras()
            print("[INFO] 카메라 정리 완료, 프로세스를 종료합니다.")
            os._exit(0)
        
        thread = threading.Thread(target=shutdown_worker)
        thread.daemon = True
        thread.start()
    
    # 지연된 종료 시작
    delayed_shutdown()
    
    # 클라이언트에 성공 응답 반환
    return jsonify({'status': 'shutting down', 'message': 'Server is shutting down safely'}), 200

@app.route('/video')
def video():
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/video2')
def video2():
    return Response(generate_frames2(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/capture')
def capture():
    """카메라 1에서 현재 프레임을 JPEG 이미지로 반환"""
    try:
        global cap
        if cap is None or not cap.isOpened():
            print("[ERROR] 카메라 0번이 연결되지 않음")
            return jsonify({'error': 'Camera 0 is not connected'}), 500
        
        success, frame = cap.read()
        if success:
            # JPEG 형식으로 인코딩
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if ret:
                return Response(buffer.tobytes(), mimetype='image/jpeg')
            else:
                return jsonify({'error': 'Failed to encode frame'}), 500
        else:
            return jsonify({'error': 'Failed to read from camera'}), 500
    except Exception as e:
        return jsonify({'error': f'Camera capture error: {str(e)}'}), 500

@app.route('/capture2')
def capture2():
    """카메라 2에서 현재 프레임을 JPEG 이미지로 반환"""
    try:
        global cap2
        if cap2 is None or not cap2.isOpened():
            print("[ERROR] 카메라 2번이 연결되지 않음")
            return jsonify({'error': 'Camera 2 is not connected'}), 500
        
        success, frame = cap2.read()
        if success:
            # JPEG 형식으로 인코딩
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            if ret:
                return Response(buffer.tobytes(), mimetype='image/jpeg')
            else:
                return jsonify({'error': 'Failed to encode frame'}), 500
        else:
            return jsonify({'error': 'Failed to read from camera 2'}), 500
    except Exception as e:
        return jsonify({'error': f'Camera 2 capture error: {str(e)}'}), 500

if __name__ == '__main__':
    # 커맨드라인 인수 파싱
    parser = argparse.ArgumentParser(description='Camera Server')
    parser.add_argument('--camera1', type=int, help='First camera index')
    parser.add_argument('--camera2', type=int, help='Second camera index')
    args = parser.parse_args()
    
    # 전역 변수에 카메라 인덱스 설정
    camera_index_1 = args.camera1
    camera_index_2 = args.camera2
    
    print(f"[INFO] 카메라 서버 시작...")
    print(f"[INFO] 선택된 카메라 인덱스: Camera 1={camera_index_1}, Camera 2={camera_index_2}")
    
    # 카메라 초기화
    initialize_cameras()
    
    try:
        # 프로덕션 모드로 실행 (디버그 모드 해제, 자동 재로더 해제)
        # 이렇게 하면 SIGTERM 신호가 제대로 전달되어 정상 종료됩니다
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, threaded=True)
    except KeyboardInterrupt:
        print("[INFO] Ctrl+C 감지됨, 카메라 서버 종료 중...")
    except Exception as e:
        print(f"[ERROR] 카메라 서버 오류: {e}")
    finally:
        print("[INFO] 최종 카메라 리소스 정리 중...")
        cleanup_cameras()
        print("[INFO] 카메라 서버 완전 종료")