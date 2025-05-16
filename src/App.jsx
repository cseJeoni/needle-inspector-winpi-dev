import { useEffect, useState } from "react";

function App() {
  const [msg, setMsg] = useState("");
  const [response, setResponse] = useState("");
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const socket = new window.WebSocket("ws://localhost:8765");
    socket.onopen = () => {
      console.log("✅ WebSocket 연결됨");
    };
    socket.onmessage = (event) => {
      console.log("📥 응답:", event.data);
      setResponse(event.data);
    };
    setWs(socket);
  }, []);

  const sendMessage = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  };

  return (
    <div>
      <h2>Electron ↔ Python WebSocket 통신</h2>
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="보낼 메시지"
      />
      <button onClick={sendMessage}>보내기</button>
      <p>응답: {response}</p>
    </div>
  );
}

export default App;
