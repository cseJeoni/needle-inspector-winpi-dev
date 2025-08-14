import TestDev from "./components/TestDev";
import ControlPanel from "./components/ControlPanel";
import NeedleInspectorUI from "./components/needle-inspector/NeedleInspectorUI";
import { AuthProvider } from "./hooks/useAuth.jsx";
import "./index.css";

function App() {
  return (
    <AuthProvider>
      <div>
        <NeedleInspectorUI />
      </div>
    </AuthProvider>
  );
}

export default App;
