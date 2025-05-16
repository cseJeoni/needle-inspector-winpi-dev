import asyncio
import websockets

async def handler(websocket):
    print("✅ 클라이언트 연결됨")
    async for message in websocket:
        print(f"📩 받은 메시지: {message}")
        await websocket.send(f"Python 응답: {message}")

async def main():
    async with websockets.serve(handler, "localhost", 8765):
        print("🚀 Python WebSocket 서버 실행 중")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
