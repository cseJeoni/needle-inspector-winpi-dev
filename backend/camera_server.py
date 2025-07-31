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

def initialize_cameras():
    """카메라 초기화 함수"""
    global cap, cap2
    
    print("[INFO] 카메라 초기화 시작...")
    
    # 기존 카메라가 있다면 먼저 해제
    cleanup_cameras()
    
    # 잠시 대기 (리소스 해제 시간)
    time.sleep(1)
    
    try:
        # 카메라 0번 초기화
        print("[INFO] 카메라 0번 초기화 중...")
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # 버퍼 크기 최소화
            print("[OK] 카메라 0번 초기화 완료")
        else:
            print("[ERROR] 카메라 0번 초기화 실패")
            cap = None
            
        # 카메라 2번 초기화
        print("[INFO] 카메라 2번 초기화 중...")
        cap2 = cv2.VideoCapture(2)
        if cap2.isOpened():
            cap2.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
            cap2.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap2.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # 버퍼 크기 최소화
            print("[OK] 카메라 2번 초기화 완료")
        else:
            print("[ERROR] 카메라 2번 초기화 실패")
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
    print("[INFO] 종료 신호 수신, 카메라 서버 종료 중...")
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
    global cap
    while True:
        if cap is None or not cap.isOpened():
            print("[ERROR] 카메라 0번이 연결되지 않음")
            break
            
        try:
            success, frame = cap.read()
            if not success:
                print("[ERROR] 카메라 0번에서 프레임 읽기 실패, 재시도 중...")
                time.sleep(0.5) # 잠시 대기 후 재시도
                continue
        except cv2.error as e:
            print(f"[ERROR] 카메라 0번 프레임 읽기 오류: {e}, 재시도 중...")
            time.sleep(0.5) # 잠시 대기 후 재시도
            continue

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            print("[ERROR] 카메라 0번 프레임 인코딩 실패")
            continue
            
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def generate_frames2():
    global cap2
    while True:
        if cap2 is None or not cap2.isOpened():
            print("[ERROR] 카메라 2번이 연결되지 않음")
            break
            
        try:
            success, frame = cap2.read()
            if not success:
                print("[ERROR] 카메라 2번에서 프레임 읽기 실패, 재시도 중...")
                time.sleep(0.5) # 잠시 대기 후 재시도
                continue
        except cv2.error as e:
            print(f"[ERROR] 카메라 2번 프레임 읽기 오류: {e}, 재시도 중...")
            time.sleep(0.5) # 잠시 대기 후 재시도
            continue

        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            print("[ERROR] 카메라 2번 프레임 인코딩 실패")
            continue
            
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

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
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    finally:
        cleanup_cameras()