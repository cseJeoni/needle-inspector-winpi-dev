import Panel from "./Panel"

export default function StatusPanel({ mode, workStatus = 'waiting' }) {
  // 상태에 따른 스타일과 메시지 정의
  const getStatusInfo = (status) => {
    switch (status) {
      case 'waiting':
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
      case 'connected':
        return { bg: 'bg-[#F3950F]', text: '니들팁 체결', textColor: 'text-white' }
      case 'disconnected':
        return { bg: 'bg-[#F3950F]', text: '니들팁 없음', textColor: 'text-white' }
      case 'write_success':
        return { bg: 'bg-[#0CB56C]', text: '저장 완료', textColor: 'text-white' }
      case 'write_failed':
        return { bg: 'bg-[#C22727]', text: '저장 실패', textColor: 'text-white' }
      default:
        return { bg: 'bg-[#646683]', text: '작업 대기', textColor: 'text-white' }
    }
  }

  const statusInfo = getStatusInfo(workStatus)

  return (
    <Panel title="작업 상태">
      {mode === "생산" ? (
        <div className={`${statusInfo.bg} rounded-md flex-1 flex items-center justify-center`}>
          <span className={`text-2xl font-bold ${statusInfo.textColor}`}>{statusInfo.text}</span>
        </div>
      ) : (
        <div className="flex flex-col flex-1 gap-2">
          <div className={`${statusInfo.bg} rounded-md h-1/2 flex items-center justify-center`}>
            <span className={`text-xl font-bold ${statusInfo.textColor}`}>{statusInfo.text}</span>
          </div>
          <div className="bg-[#171C26] rounded-md h-1/2 flex items-center justify-center text-gray-300">
            <span>검사 모드 텍스트</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
