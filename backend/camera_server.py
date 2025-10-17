from flask import Flask, Response, request, jsonify
from flask_cors import CORS
import cv2
from flask_cors import CORS
import platform
import signal
import sys
import time
import atexit

app = Flask(__name__)
CORS(app)
CORS(app) # CORS 지원 추가

# 전역 카메라 객체
cap = None
cap2 = None

# 종료 플래그
shutdown_flag = False

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
    """카메라 초기화 함수"""
    global cap, cap2
    
    print("[INFO] 카메라 초기화 시작...")
    
    # 기존 카메라가 있다면 먼저 해제
    cleanup_cameras()
    
    # 잠시 대기 (리소스 해제 시간)
    time.sleep(1)

    # available_cameras = find_available_cameras()

    # if len(available_cameras) < 1:
    #     print("[ERROR] 사용 가능한 카메라를 찾을 수 없습니다.")
    #     cap = None
    #     cap2 = None
    #     return
    
    try:
        # 첫 번째 카메라 초기화 (인덱스 0 고정)
        cam_idx1 = 0
        print(f"[INFO] 첫 번째 카메라 (인덱스: {cam_idx1}) 초기화 중...")
        cap = cv2.VideoCapture(cam_idx1, cv2.CAP_DSHOW)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            time.sleep(0.5)  # 카메라 안정화 대기
            print(f"[OK] 카메라 (인덱스: {cam_idx1}) 초기화 완료")
        else:
            print(f"[ERROR] 카메라 (인덱스: {cam_idx1}) 초기화 실패")
            cap = None

        # 두 번째 카메라 초기화 (인덱스 1 고정)
        cam_idx2 = 1
        print(f"[INFO] 두 번째 카메라 (인덱스: {cam_idx2}) 초기화 중...")
        cap2 = cv2.VideoCapture(cam_idx2, cv2.CAP_DSHOW)
        if cap2.isOpened():
            cap2.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
            cap2.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap2.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            time.sleep(0.5)  # 카메라 안정화 대기
            print(f"[OK] 카메라 (인덱스: {cam_idx2}) 초기화 완료")
        else:
            print(f"[ERROR] 카메라 (인덱스: {cam_idx2}) 초기화 실패")
            cap2 = None
            
    except Exception as e:
        print(f"[ERROR] 카메라 초기화 오류: {e}")

def cleanup_cameras():
    """카메라 리소스 정리"""
    global cap, cap2
    
    print("[INFO] 카메라 리소스 정리 중...")
    try:
        if cap is not None and cap.isOpened():
            cap.release()
            print("[OK] 카메라 0번 해제 완료")
        cap = None
        
        if cap2 is not None and cap2.isOpened():
            cap2.release()
            print("[OK] 카메라 2번 해제 완료")
        cap2 = None
        
        cv2.destroyAllWindows()
        print("[OK] 카메라 리소스 정리 완료")
        
        # 추가 대기 시간 (Windows에서 리소스 완전 해제)
        time.sleep(0.5)
        
    except Exception as e:
        print(f"[ERROR] 카메라 정리 오류: {e}")

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

# 카메라 초기화
initialize_cameras()

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
            # 주기적으로 버퍼 클리어 (100프레임마다)
            if frame_count % 100 == 0 and frame_count > 0:
                cap.grab()  # 버퍼 클리어
                
            success, frame = cap.read()
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
            # 주기적으로 버퍼 클리어 (100프레임마다)
            if frame_count % 100 == 0 and frame_count > 0:
                cap2.grab()  # 버퍼 클리어
                
            success, frame = cap2.read()
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
    try:
        # 프로덕션 모드로 실행 (디버그 모드 해제, 자동 재로더 해제)
        # 이렇게 하면 SIGTERM 신호가 제대로 전달되어 정상 종료됩니다
        app.run(host='0.0.0.0', port=5000, debug=False, use_reloader=False, threaded=True)
    finally:
        cleanup_cameras()