import Panel from "./Panel"

export default function StatusPanel({ mode }) {
  return (
    <Panel title="작업 상태">
      {mode === "생산" ? (
        <div className="bg-[#0CB56C] rounded-md flex-1 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">저장 완료</span>
        </div>
      ) : (
        <div className="flex flex-col flex-1 gap-2">
          <div className="bg-[#0CB56C] rounded-md h-1/2 flex items-center justify-center">
            <span className="text-xl font-bold text-white">저장 완료</span>
          </div>
          <div className="bg-[#171C26] rounded-md h-1/2 flex items-center justify-center text-gray-300">
            <span>검사 모드 텍스트</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
