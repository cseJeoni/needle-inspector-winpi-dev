import { useState } from "react"
import CameraView from "./CameraView"
import StatusPanel from "./StatusPanel"
import DataSettingsPanel from "./DataSettingsPanel"
import NeedleCheckPanel from "./NeedleCheckPanel"
import ModePanel from "./ModePanel"
import "../../css/NeedleInspector.css"

export default function NeedleInspectorUI() {
  const [mode, setMode] = useState("생산")

  return (
    <div className="bg-[#171C26] min-h-screen text-white font-sans p-4 flex flex-col gap-4">
      <main className="flex flex-col flex-1 gap-4">
        {/* Top Camera Views */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[60vh]">
          <CameraView title="Camera 1" />
          <CameraView title="Camera 2" />
        </div>

        {/* Bottom Control Panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
          <StatusPanel mode={mode} />
          <DataSettingsPanel />
          <NeedleCheckPanel mode={mode} />
          <ModePanel mode={mode} setMode={setMode} />
        </div>
      </main>
      <footer className="text-right text-xs text-gray-400 pr-2">SAVE MODE v1</footer>
    </div>
  )
}
