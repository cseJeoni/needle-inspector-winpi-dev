from flask import Flask, Response
import cv2
from flask_cors import CORS

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

if __name__ == '__main__':
    # 외부에서 접근 가능하도록 host='0.0.0.0'으로 설정합니다.
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)