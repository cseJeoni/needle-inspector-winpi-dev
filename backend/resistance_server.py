# resistance_server.py

import asyncio
import websockets
import json
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
                print("[ResistanceServer] 저항 측정기 연결 성공")
                return True
            else:
                print("[ResistanceServer] 저항 측정기 연결 실패")
                return False
        except Exception as e:
            print(f"[ResistanceServer] 연결 오류: {e}")
            return False
    
    def disconnect(self):
        """저항 측정기 연결 해제"""
        if self.client and self.client.is_socket_open():
            self.client.close()
            print("[ResistanceServer] 저항 측정기 연결 해제")
    
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
            
            print(f"[ResistanceServer] 측정 완료: {result}")
            return result
            
        except Exception as e:
            print(f"[ResistanceServer] 측정 오류: {e}")
            return {
                'resistance1': 'N/A', 'resistance2': 'N/A',
                'status1': 'ERROR', 'status2': 'ERROR',
                'connected': False
            }

# 전역 저항 측정기 인스턴스
resistance_measurer = ResistanceMeasurer(port="/dev/usb-resistance")
connected_clients = set()

async def handler(websocket, path):
    """WebSocket 연결 핸들러"""
    connected_clients.add(websocket)
    print(f"[ResistanceServer] 클라이언트 연결됨. 총 {len(connected_clients)}개 연결")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                command = data.get('command')
                
                if command == 'measure_resistance':
                    print("[ResistanceServer] 저항 측정 요청 수신")
                    # 저항값 측정
                    result = resistance_measurer.measure_resistance()
                    
                    # 결과를 요청한 클라이언트에게 전송
                    response = {
                        "type": "resistance_measurement",
                        "data": result
                    }
                    await websocket.send(json.dumps(response))
                    
                elif command == 'connect':
                    print("[ResistanceServer] 연결 요청 수신")
                    success = resistance_measurer.connect()
                    response = {
                        "type": "connection_status",
                        "connected": success
                    }
                    await websocket.send(json.dumps(response))
                    
                elif command == 'disconnect':
                    print("[ResistanceServer] 연결 해제 요청 수신")
                    resistance_measurer.disconnect()
                    response = {
                        "type": "connection_status",
                        "connected": False
                    }
                    await websocket.send(json.dumps(response))
                    
                else:
                    print(f"[ResistanceServer] 알 수 없는 명령: {command}")
                    
            except json.JSONDecodeError:
                print("[ResistanceServer] 잘못된 JSON 메시지 수신")
            except Exception as e:
                print(f"[ResistanceServer] 메시지 처리 오류: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        print("[ResistanceServer] 클라이언트 연결 종료")
    finally:
        connected_clients.remove(websocket)
        print(f"[ResistanceServer] 클라이언트 연결 해제됨. 총 {len(connected_clients)}개 연결")

async def main():
    """메인 서버 함수"""
    print("[ResistanceServer] 저항 측정 서버 시작")
    
    # 포트 번호는 기존 서버(8765)와 겹치지 않게 8766으로 설정
    async with websockets.serve(handler, "0.0.0.0", 8766):
        print("[ResistanceServer] 저항 측정 서버 실행 중 (ws://0.0.0.0:8766)")
        print("[ResistanceServer] 클라이언트 연결 대기 중...")
        
        # 서버 실행 유지
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[ResistanceServer] 종료 중...")
        resistance_measurer.disconnect()
        print("[ResistanceServer] 종료 완료")