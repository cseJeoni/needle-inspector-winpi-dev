# resistance.py - 저항 측정 유틸리티 모듈

import time
from pymodbus.client import ModbusSerialClient

class ResistanceMeasurer:
    def __init__(self, port='/dev/usb-resistance'):
        self.port = port
        self.baudrate = 9600
        self.timeout = 1.0
        self.slave_id_1 = 1
        self.slave_id_2 = 2
        self.client = None
    
    def __enter__(self):
        """컨텍스트 매니저 진입 - with문 사용 시 자동 연결"""
        self.connect()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """컨텍스트 매니저 종료 - 예외 발생 여부와 관계없이 자동 해제"""
        self.disconnect()
        return False  # 예외를 다시 발생시킴
    
    def connect(self):
        """저항 측정기에 연결"""
        try:
            if self.client and self.client.is_socket_open():
                self.client.close()
            
            self.client = ModbusSerialClient(
                port=self.port, 
                baudrate=self.baudrate, 
                timeout=self.timeout
            )
            
            if self.client.connect():
                print("[Resistance] 저항 측정기 연결 성공")
                return True
            else:
                print("[Resistance] 저항 측정기 연결 실패")
                return False
        except Exception as e:
            print(f"[Resistance] 연결 오류: {e}")
            return False
    
    def disconnect(self):
        """저항 측정기 연결 해제"""
        if self.client and self.client.is_socket_open():
            self.client.close()
            print("[Resistance] 저항 측정기 연결 해제")
    
    def measure_resistance(self):
        """저항값 측정 (요청 시에만)"""
        if not self.client or not self.client.is_socket_open():
            if not self.connect():
                return {
                    'resistance1': 'N/A', 'resistance2': 'N/A',
                    'status1': 'DISCONNECTED', 'status2': 'DISCONNECTED',
                    'connected': False
                }
        
        try:
            # 저항1 읽기 (Slave ID 1)
            res1 = self.client.read_holding_registers(address=0, count=1, slave=self.slave_id_1)
            # 저항2 읽기 (Slave ID 2)
            res2 = self.client.read_holding_registers(address=0, count=1, slave=self.slave_id_2)
            
            result = {'connected': True}
            
            if not res1.isError():
                result['resistance1'] = res1.registers[0]
                result['status1'] = 'OK'
            else:
                result['resistance1'] = 'N/A'
                result['status1'] = 'READ_FAIL'
            
            if not res2.isError():
                result['resistance2'] = res2.registers[0]
                result['status2'] = 'OK'
            else:
                result['resistance2'] = 'N/A'
                result['status2'] = 'READ_FAIL'
            
            print(f"[Resistance] 측정 완료: {result}")
            return result
            
        except Exception as e:
            print(f"[Resistance] 측정 오류: {e}")
            return {
                'resistance1': 'N/A', 'resistance2': 'N/A',
                'status1': 'ERROR', 'status2': 'ERROR',
                'connected': False
            }

# 전역 인스턴스 제거 - 측정 시에만 임시 생성하여 자원 충돌 방지
# resistance_measurer = ResistanceMeasurer(port="/dev/usb-resistance")

def measure_resistance_once(port="/dev/usb-resistance"):
    """
    저항 측정을 위한 일회성 함수 - 컨텍스트 매니저로 확실한 자원 해제
    연결 -> 측정 -> 즉시 해제하여 자원 충돌 방지
    """
    try:
        print("[Resistance] 임시 연결 시작...")
        # with문 사용으로 예외 발생 시에도 자동으로 연결 해제
        with ResistanceMeasurer(port=port) as measurer:
            # 측정 수행
            result = measurer.measure_resistance()
            print("[Resistance] 측정 완료, 자동 연결 해제 중...")
            return result
        
    except Exception as e:
        print(f"[Resistance] 측정 중 오류: {e}")
        return {
            'resistance1': 'N/A', 'resistance2': 'N/A',
            'status1': 'ERROR', 'status2': 'ERROR',
            'connected': False,
            'error': str(e)
        }