from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os

# pyDnx64v2 모듈 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'pyDnx64v2'))

try:
    from dnx64 import DNX64
except ImportError as e:
    print(f"DNX64 모듈 import 실패: {e}")
    DNX64 = None

app = Flask(__name__)
CORS(app)

# DNX64 객체 초기화
microscope = None
current_camera_index = -1
current_camera_id = ""

def initialize_dnx64():
    """DNX64 SDK 초기화"""
    global microscope
    
    if DNX64 is None:
        return False
        
    try:
        # DNX64.dll 경로 (실제 경로에 맞게 수정 필요)
        dll_path = os.path.join(os.path.dirname(__file__), 'pyDnx64v2', 'DNX64.dll')
        if not os.path.exists(dll_path):
            print(f"DNX64.dll을 찾을 수 없습니다: {dll_path}")
            return False
            
        microscope = DNX64(dll_path)
        
        # 초기화
        if microscope.Init():
            print("[OK] DNX64 SDK 초기화 성공")
            return True
        else:
            print("[ERROR] DNX64 SDK 초기화 실패")
            return False
            
    except Exception as e:
        print(f"DNX64 초기화 중 오류: {e}")
        return False

@app.route('/get_camera_ids', methods=['GET'])
def get_camera_ids():
    """연결된 모든 카메라의 ID와 정보를 반환"""
    global microscope
    
    try:
        if microscope is None:
            if not initialize_dnx64():
                return jsonify({
                    'success': False,
                    'error': 'DNX64 SDK 초기화 실패'
                })
        
        # 연결된 카메라 수 확인
        device_count = microscope.GetVideoDeviceCount()
        print(f"[INFO] 연결된 카메라 수: {device_count}")
        
        if device_count == 0:
            return jsonify({
                'success': True,
                'cameras': [],
                'message': '연결된 카메라가 없습니다'
            })
        
        cameras = []
        
        # 각 카메라의 정보 수집
        for i in range(device_count):
            try:
                # 카메라 이름
                name = microscope.GetVideoDeviceName(i)
                if name is None:
                    name = f"Camera {i}"
                
                # 카메라 ID (유니코드)
                device_id = microscope.GetDeviceId(i)
                if device_id is None:
                    device_id = f"Unknown_ID_{i}"
                
                # 카메라 ID (ASCII)
                device_id_ascii = microscope.GetDeviceIDA(i)
                if device_id_ascii is None:
                    device_id_ascii = f"Unknown_ASCII_ID_{i}"
                
                camera_info = {
                    'index': i,
                    'name': name,
                    'id': device_id,
                    'id_ascii': device_id_ascii.decode('utf-8') if isinstance(device_id_ascii, bytes) else device_id_ascii
                }
                
                cameras.append(camera_info)
                print(f"[INFO] 카메라 {i}: {camera_info}")
                
            except Exception as e:
                print(f"[ERROR] 카메라 {i} 정보 수집 실패: {e}")
                # 오류가 있어도 기본 정보는 추가
                cameras.append({
                    'index': i,
                    'name': f"Camera {i} (Error)",
                    'id': f"Error_ID_{i}",
                    'id_ascii': f"Error_ASCII_ID_{i}"
                })
        
        return jsonify({
            'success': True,
            'cameras': cameras,
            'total_count': device_count
        })
        
    except Exception as e:
        print(f"[ERROR] get_camera_ids 실행 중 오류: {e}")
        return jsonify({
            'success': False,
            'error': f'카메라 ID 조회 실패: {str(e)}'
        })

@app.route('/connect_camera_by_id', methods=['POST'])
def connect_camera_by_id():
    """특정 카메라 ID로 카메라 연결"""
    global microscope, current_camera_index, current_camera_id
    
    try:
        if microscope is None:
            if not initialize_dnx64():
                return jsonify({
                    'success': False,
                    'error': 'DNX64 SDK 초기화 실패'
                })
        
        data = request.get_json()
        target_camera_id = data.get('camera_id')
        
        if not target_camera_id:
            return jsonify({
                'success': False,
                'error': '카메라 ID가 제공되지 않았습니다'
            })
        
        print(f"[INFO] 카메라 ID로 연결 시도: {target_camera_id}")
        
        # 연결된 카메라 수 확인
        device_count = microscope.GetVideoDeviceCount()
        
        # 해당 ID를 가진 카메라 찾기
        found_index = -1
        for i in range(device_count):
            try:
                device_id = microscope.GetDeviceId(i)
                device_id_ascii = microscope.GetDeviceIDA(i)
                
                # ASCII 버전을 문자열로 변환
                if isinstance(device_id_ascii, bytes):
                    device_id_ascii = device_id_ascii.decode('utf-8')
                
                # ID 매칭 (유니코드 또는 ASCII)
                if device_id == target_camera_id or device_id_ascii == target_camera_id:
                    found_index = i
                    break
                    
            except Exception as e:
                print(f"[ERROR] 카메라 {i} ID 확인 중 오류: {e}")
                continue
        
        if found_index == -1:
            return jsonify({
                'success': False,
                'error': f'카메라 ID "{target_camera_id}"를 찾을 수 없습니다'
            })
        
        # 카메라 연결
        try:
            microscope.SetVideoDeviceIndex(found_index)
            print(f"[OK] 카메라 인덱스 {found_index} 설정 완료")
            
            # 현재 연결된 카메라 정보 업데이트
            current_camera_index = found_index
            current_camera_id = target_camera_id
            
            # 카메라 이름도 가져오기
            camera_name = microscope.GetVideoDeviceName(found_index)
            
            return jsonify({
                'success': True,
                'camera_index': found_index,
                'camera_id': target_camera_id,
                'camera_name': camera_name,
                'message': f'카메라 연결 성공 (인덱스: {found_index})'
            })
            
        except Exception as e:
            print(f"[ERROR] 카메라 연결 실패: {e}")
            return jsonify({
                'success': False,
                'error': f'카메라 연결 실패: {str(e)}'
            })
        
    except Exception as e:
        print(f"[ERROR] connect_camera_by_id 실행 중 오류: {e}")
        return jsonify({
            'success': False,
            'error': f'카메라 연결 처리 실패: {str(e)}'
        })

@app.route('/get_current_camera', methods=['GET'])
def get_current_camera():
    """현재 연결된 카메라 정보 반환"""
    global current_camera_index, current_camera_id
    
    return jsonify({
        'success': True,
        'current_camera_index': current_camera_index,
        'current_camera_id': current_camera_id,
        'is_connected': current_camera_index >= 0
    })

@app.route('/disconnect_camera', methods=['POST'])
def disconnect_camera():
    """카메라 연결 해제"""
    global current_camera_index, current_camera_id
    
    try:
        current_camera_index = -1
        current_camera_id = ""
        
        return jsonify({
            'success': True,
            'message': '카메라 연결 해제됨'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'카메라 연결 해제 실패: {str(e)}'
        })

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인"""
    return jsonify({
        'success': True,
        'message': 'Camera ID Server is running',
        'dnx64_available': DNX64 is not None,
        'microscope_initialized': microscope is not None
    })

if __name__ == '__main__':
    print("=== Camera ID Server 시작 ===")
    print("포트: 5001")
    print("DNX64 SDK 사용 가능:", DNX64 is not None)
    
    try:
        app.run(host='0.0.0.0', port=5001, debug=True, threaded=True)
    except Exception as e:
        print(f"서버 시작 실패: {e}")
    finally:
        print("=== Camera ID Server 종료 ===")
