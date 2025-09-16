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
    저항 측정을 위한 일회성 함수
    연결 -> 측정 -> 즉시 해제하여 자원 충돌 방지
    """
    measurer = None
    try:
        print("[Resistance] 임시 연결 시작...")
        measurer = ResistanceMeasurer(port=port)
        
        # 연결 시도
        if not measurer.connect():
            return {
                'resistance1': 'N/A', 'resistance2': 'N/A',
                'status1': 'CONNECTION_FAILED', 'status2': 'CONNECTION_FAILED',
                'connected': False,
                'error': '저항 측정기 연결 실패'
            }
        
        # 측정 수행
        result = measurer.measure_resistance()
        print("[Resistance] 측정 완료, 연결 해제 중...")
        
        return result
        
    except Exception as e:
        print(f"[Resistance] 측정 중 오류: {e}")
        return {
            'resistance1': 'N/A', 'resistance2': 'N/A',
            'status1': 'ERROR', 'status2': 'ERROR',
            'connected': False,
            'error': str(e)
        }
    finally:
        # 반드시 연결 해제
        if measurer:
            try:
                measurer.disconnect()
                print("[Resistance] 임시 연결 해제 완료")
            except Exception as e:
                print(f"[Resistance] 연결 해제 중 오류: {e}")