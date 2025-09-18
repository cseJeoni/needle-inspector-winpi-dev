#!/usr/bin/env python3
"""
하드웨어 연결 상태 및 시리얼 포트 충돌 진단 스크립트
"""

import serial
import serial.tools.list_ports
import time
import sys
from pymodbus.client import ModbusSerialClient

def check_serial_ports():
    """사용 가능한 시리얼 포트 확인"""
    print("=== 시리얼 포트 검사 ===")
    ports = serial.tools.list_ports.comports()
    
    if not ports:
        print("❌ 사용 가능한 시리얼 포트가 없습니다.")
        return []
    
    available_ports = []
    for port in ports:
        print(f"📍 포트: {port.device}")
        print(f"   설명: {port.description}")
        print(f"   제조사: {port.manufacturer}")
        print(f"   VID:PID: {port.vid}:{port.pid}")
        available_ports.append(port.device)
        print()
    
    return available_ports

def test_motor_connection(port):
    """모터 연결 테스트"""
    print(f"=== 모터 연결 테스트: {port} ===")
    try:
        # 시리얼 연결 시도
        ser = serial.Serial(
            port=port,
            baudrate=115200,
            parity=serial.PARITY_NONE,
            stopbits=serial.STOPBITS_ONE,
            bytesize=serial.EIGHTBITS,
            timeout=1
        )
        
        print(f"✅ 모터 시리얼 연결 성공: {port}")
        
        # 간단한 명령 전송 테스트
        test_command = b"SVRE1\r\n"  # 서보 ON 명령
        ser.write(test_command)
        time.sleep(0.1)
        
        # 응답 읽기
        response = ser.read_all()
        if response:
            print(f"📨 모터 응답: {response}")
        else:
            print("⚠️ 모터 응답 없음")
        
        ser.close()
        return True
        
    except Exception as e:
        print(f"❌ 모터 연결 실패: {e}")
        return False

def test_resistance_connection(port):
    """저항 측정기 연결 테스트"""
    print(f"=== 저항 측정기 연결 테스트: {port} ===")
    try:
        # Modbus RTU 클라이언트 생성
        client = ModbusSerialClient(
            port=port,
            baudrate=9600,
            timeout=1.0
        )
        
        if client.connect():
            print(f"✅ 저항 측정기 연결 성공: {port}")
            
            # Slave ID 1, 2에서 레지스터 읽기 테스트
            for slave_id in [1, 2]:
                try:
                    result = client.read_holding_registers(address=0, count=1, slave=slave_id)
                    if not result.isError():
                        print(f"📊 Slave {slave_id} 저항값: {result.registers[0]} Ω")
                    else:
                        print(f"⚠️ Slave {slave_id} 읽기 실패: {result}")
                except Exception as e:
                    print(f"❌ Slave {slave_id} 오류: {e}")
            
            client.close()
            return True
        else:
            print(f"❌ 저항 측정기 연결 실패: {port}")
            return False
            
    except Exception as e:
        print(f"❌ 저항 측정기 연결 오류: {e}")
        return False

def check_port_conflicts():
    """포트 충돌 검사"""
    print("=== 포트 충돌 검사 ===")
    
    # 일반적인 포트들
    test_ports = [
        "/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyUSB2",
        "/dev/ttyACM0", "/dev/ttyACM1", 
        "/dev/usb-motor", "/dev/usb-resistance",
        "COM3", "COM4", "COM5", "COM6", "COM7", "COM8"
    ]
    
    motor_ports = []
    resistance_ports = []
    
    for port in test_ports:
        try:
            # 모터 테스트
            if test_motor_connection(port):
                motor_ports.append(port)
                
            time.sleep(0.5)  # 포트 해제 대기
            
            # 저항 측정기 테스트  
            if test_resistance_connection(port):
                resistance_ports.append(port)
                
            time.sleep(0.5)  # 포트 해제 대기
            
        except Exception as e:
            continue
    
    print("\n=== 검사 결과 ===")
    print(f"🔧 모터 포트: {motor_ports}")
    print(f"📊 저항 측정기 포트: {resistance_ports}")
    
    # 충돌 검사
    conflicts = set(motor_ports) & set(resistance_ports)
    if conflicts:
        print(f"⚠️ 포트 충돌 감지: {conflicts}")
        print("💡 해결 방안:")
        print("   1. 각 장치를 다른 USB 포트에 연결")
        print("   2. USB 허브 사용 시 개별 포트로 분리")
        print("   3. 시리얼 포트 설정 확인")
    else:
        print("✅ 포트 충돌 없음")

def main():
    print("🔍 하드웨어 진단 시작...\n")
    
    # 1. 시리얼 포트 검사
    available_ports = check_serial_ports()
    
    if not available_ports:
        print("❌ 시리얼 포트를 찾을 수 없습니다. USB 연결을 확인하세요.")
        return
    
    # 2. 포트 충돌 검사
    check_port_conflicts()
    
    print("\n🎯 진단 완료!")
    print("\n💡 문제 해결 가이드:")
    print("1. 모터와 저항 측정기가 다른 포트를 사용하는지 확인")
    print("2. ws_server.py가 실행 중인지 확인")
    print("3. 필요시 USB 케이블 재연결")
    print("4. 시스템 재부팅 후 재시도")

if __name__ == "__main__":
    main()
