# resistance_server.py

import asyncio
import websockets
import json
import time
import threading
from pymodbus.client import ModbusSerialClient

# 저항 측정 로직은 이전에 만들었던 독립 스레드 방식을 그대로 사용합니다.
class ResistanceThread(threading.Thread):
    def __init__(self, port='/dev/usb-resistance'):
        super().__init__(daemon=True)
        self.port = port
        self.baudrate = 9600
        self.timeout = 1.0
        self.slave_id_1 = 1
        self.slave_id_2 = 2
        self.stopped = threading.Event()
        self.lock = threading.Lock()
        self.last_values = {
            'resistance1': None, 'resistance2': None,
            'status1': 'INITIALIZING', 'status2': 'INITIALIZING',
            'connected': False
        }

    def run(self):
        print("[ResistanceServer] 스레드 시작됨. 저항값 측정을 시작합니다.")
        client = ModbusSerialClient(port=self.port, baudrate=self.baudrate, timeout=self.timeout)
        
        while not self.stopped.is_set():
            if not client.is_socket_open():
                print("[ResistanceServer] 연결 시도...")
                if not client.connect():
                    with self.lock:
                        self.last_values.update({'status1': 'DISCONNECTED', 'status2': 'DISCONNECTED', 'connected': False})
                    time.sleep(2.0)
                    continue
                else:
                    print("[ResistanceServer] 연결 성공.")
            
            res1 = client.read_holding_registers(address=0, count=1, slave=self.slave_id_1)
            res2 = client.read_holding_registers(address=0, count=1, slave=self.slave_id_2)

            with self.lock:
                self.last_values['connected'] = True
                if not res1.isError(): self.last_values['resistance1'] = res1.registers[0]; self.last_values['status1'] = 'OK'
                else: self.last_values['status1'] = 'READ_FAIL'
                
                if not res2.isError(): self.last_values['resistance2'] = res2.registers[0]; self.last_values['status2'] = 'OK'
                else: self.last_values['status2'] = 'READ_FAIL'

            if res1.isError() or res2.isError():
                client.close()
                print("[ResistanceServer] 읽기 실패, 재연결을 위해 연결을 닫습니다.")
            
            time.sleep(0.2)
        
        if client.is_socket_open(): client.close()
        print("[ResistanceServer] 스레드 종료됨.")

    def stop(self): self.stopped.set()
    def get_current_values(self):
        with self.lock: return self.last_values.copy()

connected_clients = set()

async def handler(websocket):
    connected_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.remove(websocket)

async def broadcast_resistance_values(res_thread):
    while True:
        values = res_thread.get_current_values()
        message = json.dumps({"type": "resistance_update", "data": values})
        if connected_clients:
            await asyncio.wait([ws.send(message) for ws in connected_clients])
        await asyncio.sleep(0.1) # 0.1초마다 방송

async def main():
    # udev로 설정한 고유 포트 이름을 사용하세요.
    resistance_thread = ResistanceThread(port="/dev/resistance_meter") 
    resistance_thread.start()

    # 포트 번호는 기존 서버(8765)와 겹치지 않게 8766으로 설정
    async with websockets.serve(handler, "0.0.0.0", 8766):
        print("[ResistanceServer] 저항값 방송 서버 실행 중 (ws://0.0.0.0:8766)")
        await broadcast_resistance_values(resistance_thread)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[ResistanceServer] 종료 중...")