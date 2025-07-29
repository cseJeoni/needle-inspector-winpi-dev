import Panel from "./Panel"
import { Button } from "./Button"

export default function JudgePanel({ onJudge }) {
  const handleNGClick = () => {
    console.log("NG 판정")
    if (onJudge) onJudge('NG')
  }

  const handlePassClick = () => {
    console.log("PASS 판정")
    if (onJudge) onJudge('PASS')
  }

  return (
    <Panel title="판정">
      <div style={{ display: 'flex', gap: '1dvw', height: '100%' }}>
        {/* NG 버튼 */}
        <Button
          onClick={handleNGClick}
          style={{
            flex: 1,
            backgroundColor: '#C22727',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh'
          }}
        >
          NG
        </Button>
        
        {/* PASS 버튼 */}
        <Button
          onClick={handlePassClick}
          style={{
            flex: 1,
            backgroundColor: '#0CB56C',
            color: 'white',
            fontSize: '2dvh',
            fontWeight: 'bold',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '30dvh'
          }}
        >
          PASS
        </Button>
      </div>
    </Panel>
  )
}
