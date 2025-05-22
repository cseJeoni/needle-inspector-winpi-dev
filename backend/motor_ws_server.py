import asyncio
import websockets
import json
from motor_threaded_controller import MotorThreadedController

motor = MotorThreadedController()
connected_clients = set()

async def handler(websocket):
    print("[INFO] 클라이언트 연결됨")
    connected_clients.add(websocket)
    try:
        async for msg in websocket:
            try:
                data = json.loads(msg)
                print(f"[INFO] 수신된 메시지: {data}")

                if data["cmd"] == "connect":
                    port = data.get("port")
                    baudrate = data.get("baudrate")
                    parity = data.get("parity")
                    databits = data.get("databits")
                    stopbits = data.get("stopbits")

                    result = motor.connect(port, baudrate, parity, databits, stopbits)
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": result
                    }))

                elif data["cmd"] == "disconnect":
                    result = motor.disconnect()
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": result
                    }))

                elif data["cmd"] == "move":
                    mode = data.get("mode", "servo")
                    position = data.get("position")
                    speed = data.get("speed")
                    force = data.get("force")
                    
                    print(f"[INFO] 모터 이동 명령 수신: mode={mode}, position={position}, speed={speed}, force={force}")
                    
                    if mode == "servo" or mode == "position":
                        if position is not None:
                            result = motor.move_to_position(position, mode)
                            print(f"[INFO] 모터 이동 결과: {result}")
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "위치 값이 없습니다."
                            }))
                    
                    elif mode == "speed":
                        if speed is not None and position is not None:
                            result = motor.move_with_speed(speed, position)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "속도 또는 위치 값이 없습니다."
                            }))
                    
                    elif mode == "speed_force":
                        if all(v is not None for v in [force, speed, position]):
                            result = motor.move_with_speed_force(force, speed, position)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "힘, 속도, 또는 위치 값이 없습니다."
                            }))
                    
                    elif mode == "force":
                        if force is not None:
                            result = motor.set_force(force)
                            await websocket.send(json.dumps({
                                "type": "serial",
                                "result": result
                            }))
                        else:
                            await websocket.send(json.dumps({
                                "type": "error",
                                "result": "힘 값이 없습니다."
                            }))
                    
                    else:
                        await websocket.send(json.dumps({
                            "type": "error",
                            "result": f"❌ 지원하지 않는 모드입니다: {mode}"
                        }))

                elif data["cmd"] == "check":
                    connected = motor.is_connected()
                    await websocket.send(json.dumps({
                        "type": "serial",
                        "result": "연결됨" if connected else "연결 안됨"
                    }))

                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "result": "알 수 없는 명령어입니다."
                    }))

            except Exception as e:
                print(f"[ERROR] 처리 중 에러: {str(e)}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "result": str(e)
                }))
    finally:
        connected_clients.discard(websocket)
        print("[INFO] 클라이언트 연결 해제됨")

async def push_motor_status():
    while True:
        await asyncio.sleep(0.05)
        if motor.is_connected():
            data = {
                "type": "status",
                "data": {
                    "position": motor.position,
                    "force": motor.force,
                    "sensor": motor.sensor,
                    "setPos": motor.setPos
                }
            }
            for ws in connected_clients.copy():
                try:
                    await ws.send(json.dumps(data))
                except Exception as e:
                    print(f"[WARN] 상태 전송 실패: {e}")
                    connected_clients.discard(ws)

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("[INFO] WebSocket 모터 서버 실행 중 (ws://localhost:8765)")
        await push_motor_status()  # 상태 주기 전송 루프 시작

if __name__ == "__main__":
    asyncio.run(main())
