from flask import Flask, Response, request, jsonify
import cv2
from flask_cors import CORS
import platform

app = Flask(__name__)
CORS(app) # CORS 지원 추가


# 사용자가 언급한 카메라 인덱스 0번과 1번으로 수정
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

cap2 = cv2.VideoCapture(2)
cap2.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
cap2.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

def generate_frames():
    while True:
        success, frame = cap.read()
        if not success:
            # 카메라 연결이 끊겼을 경우, 여기서 루프를 중단하거나 재연결 로직을 추가할 수 있습니다.
            break

        ret, buffer = cv2.imencode('.jpg', frame)
        frame = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def generate_frames2():
    while True:
        success, frame = cap2.read()
        if not success:
            break

        ret, buffer = cv2.imencode('.jpg', frame)
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

@app.route('/gpio', methods=['POST'])
def control_gpio():
    """GPIO 18번 핀 제어"""
    try:
        data = request.get_json()
        state = data.get('state')  # 'high' 또는 'low'
        
        if not gpio_available:
            return jsonify({
                'success': False,
                'message': 'GPIO 기능을 사용할 수 없습니다. Raspberry Pi에서 실행하세요.'
            }), 400
        
        if state == 'high':
            GPIO.output(18, GPIO.HIGH)
            message = 'GPIO 18번 핀이 HIGH로 설정되었습니다.'
            print(f"[OK] {message}")
        elif state == 'low':
            GPIO.output(18, GPIO.LOW)
            message = 'GPIO 18번 핀이 LOW로 설정되었습니다.'
            print(f"[OK] {message}")
        else:
            return jsonify({
                'success': False,
                'message': 'state는 "high" 또는 "low"여야 합니다.'
            }), 400
        
        return jsonify({
            'success': True,
            'message': message,
            'pin': 18,
            'state': state.upper()
        })
        
    except Exception as e:
        error_msg = f"GPIO 제어 오류: {str(e)}"
        print(f"[ERROR] {error_msg}")
        return jsonify({
            'success': False,
            'message': error_msg
        }), 500

@app.route('/gpio/state', methods=['GET'])
def get_gpio_state():
    """GPIO 18번 핀 상태 읽기"""
    try:
        if not gpio_available:
            return jsonify({
                'success': False,
                'message': 'GPIO 기능을 사용할 수 없습니다. Raspberry Pi에서 실행하세요.'
            }), 400
        
        state = GPIO.input(18)
        return jsonify({
            'success': True,
            'pin': 18,
            'state': 'HIGH' if state else 'LOW'
        })
        
    except Exception as e:
        error_msg = f"GPIO 상태 읽기 오류: {str(e)}"
        print(f"[ERROR] {error_msg}")
        return jsonify({
            'success': False,
            'message': error_msg
        }), 500

if __name__ == '__main__':
    try:
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    finally:
        # 앱 종료 시 GPIO 정리
        if gpio_available:
            GPIO.cleanup()
            print("[OK] GPIO 정리 완료")