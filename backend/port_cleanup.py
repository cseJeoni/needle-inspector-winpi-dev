#!/usr/bin/env python3
"""
시리얼 포트 잠김 현상 해결을 위한 강제 정리 스크립트
"""

import os
import subprocess
import signal
import psutil
import serial.tools.list_ports

def find_processes_using_port(port_name):
    """특정 포트를 사용하는 프로세스 찾기"""
    processes = []
    try:
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                # 프로세스의 열린 파일 확인
                for file in proc.open_files():
                    if port_name in file.path:
                        processes.append({
                            'pid': proc.info['pid'],
                            'name': proc.info['name'],
                            'cmdline': ' '.join(proc.info['cmdline'] or [])
                        })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:
        print(f"프로세스 검색 오류: {e}")
    
    return processes

def kill_port_processes(port_name):
    """포트를 사용하는 프로세스 강제 종료"""
    processes = find_processes_using_port(port_name)
    
    if not processes:
        print(f"✅ {port_name}을 사용하는 프로세스가 없습니다.")
        return True
    
    print(f"⚠️ {port_name}을 사용하는 프로세스 발견:")
    for proc in processes:
        print(f"  PID: {proc['pid']}, 이름: {proc['name']}")
        print(f"  명령: {proc['cmdline']}")
        
        try:
            # SIGTERM으로 정상 종료 시도
            os.kill(proc['pid'], signal.SIGTERM)
            print(f"  → SIGTERM 전송")
            
            # 잠시 대기 후 여전히 살아있으면 SIGKILL
            import time
            time.sleep(2)
            
            if psutil.pid_exists(proc['pid']):
                os.kill(proc['pid'], signal.SIGKILL)
                print(f"  → SIGKILL 전송 (강제 종료)")
            
        except ProcessLookupError:
            print(f"  → 이미 종료됨")
        except PermissionError:
            print(f"  → 권한 부족 (sudo 필요)")
        except Exception as e:
            print(f"  → 종료 실패: {e}")
    
    return True

def reset_usb_device(device_path):
    """USB 장치 리셋"""
    try:
        # USB 장치 리셋 (Linux)
        if os.path.exists('/sys/bus/usb/drivers/usb'):
            # USB 장치 ID 찾기
            result = subprocess.run(['lsusb'], capture_output=True, text=True)
            print(f"USB 장치 목록:\n{result.stdout}")
            
        # 시리얼 포트 권한 재설정
        if os.path.exists(device_path):
            subprocess.run(['sudo', 'chmod', '666', device_path], check=True)
            print(f"✅ {device_path} 권한 재설정 완료")
            
    except Exception as e:
        print(f"❌ USB 장치 리셋 실패: {e}")

def cleanup_serial_ports():
    """모든 시리얼 포트 정리"""
    print("🔍 시리얼 포트 정리 시작...")
    
    # 일반적인 시리얼 포트들
    ports_to_check = [
        '/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2',
        '/dev/ttyACM0', '/dev/ttyACM1',
        '/dev/usb-motor', '/dev/usb-resistance'
    ]
    
    for port in ports_to_check:
        if os.path.exists(port):
            print(f"\n📍 {port} 정리 중...")
            kill_port_processes(port)
            reset_usb_device(port)
    
    print("\n✅ 시리얼 포트 정리 완료!")

def test_port_access():
    """포트 접근 테스트"""
    print("\n🧪 포트 접근 테스트...")
    
    ports = serial.tools.list_ports.comports()
    for port in ports:
        try:
            # 간단한 연결 테스트
            ser = serial.Serial(port.device, timeout=1)
            ser.close()
            print(f"✅ {port.device}: 접근 가능")
        except Exception as e:
            print(f"❌ {port.device}: 접근 불가 ({e})")

if __name__ == "__main__":
    print("🛠️ 시리얼 포트 잠김 해결 도구")
    print("=" * 50)
    
    cleanup_serial_ports()
    test_port_access()
    
    print("\n💡 사용법:")
    print("1. 이 스크립트를 실행하여 잠긴 포트 해제")
    print("2. 필요시 sudo 권한으로 실행")
    print("3. USB 케이블 재연결")
    print("4. 라즈베리파이 재부팅 (최후의 수단)")
