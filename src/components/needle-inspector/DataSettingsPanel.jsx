"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"

export default function DataSettingsPanel({ makerCode, onWorkStatusChange, isStarted, onStartedChange, readEepromData, onReadEepromDataChange, needleTipConnected }) {
  // isStarted와 readEepromData는 이제 props로 받아서 사용
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDay, setSelectedDay] = useState("")
  const [selectedCountry, setSelectedCountry] = useState("ilooda")
  const [selectedNeedleType, setSelectedNeedleType] = useState("25&16")
  
  // 저장 데이터 설정 활성화 상태 (기본값: 비활성화)
  const [isDataSettingsEnabled, setIsDataSettingsEnabled] = useState(false)

  // 현재 날짜 정보
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0")
  const currentDay = String(currentDate.getDate()).padStart(2, "0")

  // 년도 옵션 (전년도, 올해)
  const yearOptions = [currentYear - 1, currentYear]

  // 월 옵션 (01-12)
  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"))

  // 해당 년월의 일수 계산
  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate()
  }

  // Tip Type으로부터 정보 역매핑
  const getInfoFromTipType = (tipType) => {
    const tipTypeMap = {
      "cutera": {
        "25&16": 208,
        "1&10": 209,
        "10": 210,
        "64": 211
      },
      "ilooda": {
        "25&16": 216,
        "1&10": 217,
        "10": 218,
        "64": 219,
        "25": 230
      },
      "ilooda_export": {
        "25&16": 216,
        "1&10": 217,
        "10": 218,
        "64": 219,
        "25": 230
      }
    };

    const countryDisplayMap = {
      "cutera": "CUTERA",
      "ilooda": "ILOODA (국내)",
      "ilooda_export": "ILOODA (해외)"
    };

    const needleDisplayMap = {
      "25&16": "25 & 16 PIN",
      "1&10": "1 & 10 PIN",
      "10": "10 PIN",
      "64": "64 PIN",
      "25": "25 PIN"
    };

    for (const country in tipTypeMap) {
      for (const needle in tipTypeMap[country]) {
        if (tipTypeMap[country][needle] === tipType) {
          return {
            country: countryDisplayMap[country],
            needle: needleDisplayMap[needle]
          };
        }
      }
    }
    return { country: "알 수 없음", needle: "알 수 없음" };
  };

  // 일 옵션 생성
  const getDayOptions = () => {
    if (!selectedYear || !selectedMonth) return []
    const daysInMonth = getDaysInMonth(Number.parseInt(selectedYear), Number.parseInt(selectedMonth))
    return Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"))
  }

  // 니들 옵션 생성
  const getNeedleOptions = () => {
    const options = {
      cutera: [
        { value: "25&16", label: "25 & 16 PIN" },
        { value: "1&10", label: "1 & 10 PIN" },
        { value: "10", label: "10 PIN" },
        { value: "64", label: "64 PIN" },
      ],
      ilooda: [
        { value: "25&16", label: "25 & 16 PIN" },
        { value: "1&10", label: "1 & 10 PIN" },
        { value: "10", label: "10 PIN" },
        { value: "64", label: "64 PIN" },
        { value: "25", label: "25 PIN" },
      ],
      ilooda_export: [
        { value: "25&16", label: "25 & 16 PIN" },
        { value: "1&10", label: "1 & 10 PIN" },
        { value: "10", label: "10 PIN" },
        { value: "64", label: "64 PIN" },
        { value: "25", label: "25 PIN" },
      ],
    };
    return options[selectedCountry] || [];
  };

  // TIP TYPE 계산 함수
  const calculateTipType = () => {
    const tipTypeMap = {
      "cutera": {
        "25&16": 208,
        "1&10": 209,
        "10": 210,
        "64": 211
      },
      "ilooda": {
        "25&16": 216,
        "1&10": 217,
        "10": 218,
        "64": 219,
        "25": 230
      },
      "ilooda_export": { // 해외향 추가
        "25&16": 216,
        "1&10": 217,
        "10": 218,
        "64": 219,
        "25": 230
      }
    }
    
    return tipTypeMap[selectedCountry]?.[selectedNeedleType] || null
  }

  // 초기값 설정
  useEffect(() => {
    setSelectedYear(String(currentYear))
    setSelectedMonth(currentMonth)
    setSelectedDay(currentDay)
  }, [])

  // 국가가 변경될 때 니들 종류 초기화
  useEffect(() => {
    const options = getNeedleOptions();
    if (options.length > 0) {
      // 현재 선택된 니들이 새 옵션에 없으면 첫번째 옵션으로 설정
      if (!options.find(opt => opt.value === selectedNeedleType)) {
        setSelectedNeedleType(options[0].value);
      }
    } else {
      setSelectedNeedleType("");
    }
  }, [selectedCountry]);

  // 월이 변경될 때 일 옵션 재설정
  useEffect(() => {
    if (selectedYear && selectedMonth) {
      const dayOptions = getDayOptions()
      // 현재 선택된 일이 새로운 월의 일수를 초과하면 해당 월의 마지막 날로 설정
      if (selectedDay && Number.parseInt(selectedDay) > dayOptions.length) {
        setSelectedDay(dayOptions[dayOptions.length - 1])
      }
    }
  }, [selectedYear, selectedMonth])

  // EEPROM 읽기 함수 (WebSocket 통신)
  const readFromEEPROM = async () => {
    // onWorkStatusChange("waiting"); // READ 버튼 클릭 시 상태 변경하지 않음
    const ws = new WebSocket("ws://192.168.0.122:8765");

    ws.onopen = () => {
      console.log("WebSocket for READ opened");
      ws.send(JSON.stringify({ cmd: "eeprom_read" }));
    };

    ws.onmessage = (event) => {
      const response = JSON.parse(event.data);
      console.log("EEPROM Read Response:", response);
      if (response.type === "eeprom_read" && response.result.success) {
        // onWorkStatusChange("connected"); // READ 버튼 클릭 시 상태 변경하지 않음
        onReadEepromDataChange && onReadEepromDataChange(response.result);
        console.log("EEPROM Data:", response.result);
      } else {
        // onWorkStatusChange("disconnected"); // READ 버튼 클릭 시 상태 변경하지 않음
        onReadEepromDataChange && onReadEepromDataChange(null);
      }
      ws.close();
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      // onWorkStatusChange("disconnected"); // READ 버튼 클릭 시 상태 변경하지 않음
      ws.close();
    };

    ws.onclose = () => {
      console.log("WebSocket for READ closed");
    };
  };

  // EEPROM에 데이터 쓰기 함수 (WebSocket 통신)
  const writeToEEPROM = async () => {
    const tipType = calculateTipType()
    
    const eepromData = {
      cmd: "eeprom_write",
      tipType: tipType,
      shotCount: 0, // 무조건 0
      year: parseInt(selectedYear),
      month: parseInt(selectedMonth),
      day: parseInt(selectedDay),
      makerCode: 4
    }
    
    console.log('EEPROM에 쓸 데이터:', eepromData)
    
    try {
      // WebSocket을 통해 라즈베리파이에 데이터 전송
      // 주의: 실제 구현에서는 기존 WebSocket 연결을 사용해야 합니다
      const ws = new WebSocket('ws://192.168.0.122:8765') // 실제 라즈베리파이 IP 주소로 변경하세요
      
      ws.onopen = () => {
        console.log('WebSocket 연결 성공')
        // EEPROM 읽기 시도 (니들팁 체결 여부 확인)
        ws.send(JSON.stringify({ cmd: "eeprom_read" }))
      }
      
      ws.onmessage = async (event) => {
        const response = JSON.parse(event.data)
        console.log('EEPROM 응답:', response)
        
        if (response.type === 'eeprom_read') {
          if (response.result.success) {
            console.log('EEPROM 읽기 성공 - 니들팁 체결됨')
            // onWorkStatusChange && onWorkStatusChange('connected') // 니들팁 있음 상태는 UI에 표시하지 않음
            // 읽기 성공 후 쓰기 진행
            ws.send(JSON.stringify(eepromData))
          } else {
            console.log('EEPROM 읽기 실패 - 니들팁 없음')
            onWorkStatusChange && onWorkStatusChange('disconnected')
            ws.close()
          }
        } else if (response.type === 'eeprom_write') {
          if (response.result.success) {
            console.log('EEPROM 쓰기 성공:', response.result)
            onWorkStatusChange && onWorkStatusChange('write_success')
            
            // 쓰기 성공 후 데이터를 바로 표시
            if (response.result.data) {
              onReadEepromDataChange && onReadEepromDataChange(response.result.data)
              console.log('EEPROM 데이터 표시:', response.result.data)
            }
          } else {
            console.error('EEPROM 쓰기 실패:', response.result.error)
            onWorkStatusChange && onWorkStatusChange('write_failed')
          }
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket 오류:', error)
        onWorkStatusChange && onWorkStatusChange('disconnected')
      }
      
      ws.onclose = () => {
        console.log('WebSocket 연결 종료')
      }
      
    } catch (error) {
      console.error('EEPROM 쓰기 오류:', error)
    }
  }
  
  // 저장 데이터 설정 활성화/비활성화 토글 함수
  const handleDataSettingsToggle = () => {
    setIsDataSettingsEnabled(!isDataSettingsEnabled)
    console.log(`저장 데이터 설정: ${!isDataSettingsEnabled ? 'UNLOCK' : 'LOCK'}`)
  }

  const handleToggle = async () => {
    const tipType = calculateTipType()
    console.log('TIP TYPE:', tipType)
    console.log('Country:', selectedCountry, 'Needle Type:', selectedNeedleType)
    console.log('Maker Code:', makerCode)
    
    if (!isStarted) {
      // 니들팁이 연결되지 않은 상태에서는 START 버튼 동작 차단
      if (!needleTipConnected) {
        console.log('니들팁이 연결되지 않아 START 버튼 동작을 차단합니다.')
        onWorkStatusChange && onWorkStatusChange('disconnected')
        return // 조기 종료
      }
      
      // START 버튼을 눌렀을 때 상태 초기화 후 EEPROM에 쓰기
      onWorkStatusChange && onWorkStatusChange('waiting')
      
      // 니들 UP 명령 전송
      try {
        const needleWs = new WebSocket('ws://192.168.0.122:8765')
        needleWs.onopen = () => {
          console.log('니들 UP 명령 전송')
          needleWs.send(JSON.stringify({ cmd: "move", position: 840, mode: "position" })) // 니듡 UP
          needleWs.close()
        }
      } catch (error) {
        console.error('니들 UP 명령 전송 실패:', error)
      }
      
      await writeToEEPROM()
      // EEPROM 쓰기 완료 후 읽기 수행
      setTimeout(() => {
        readFromEEPROM()
      }, 1000) // 1초 후 읽기 수행 (쓰기 완료 대기)
    } else {
      // STOP 버튼을 눌렀을 때 모터 DOWN 명령 전송 후 대기 상태로 복귀
      onWorkStatusChange && onWorkStatusChange('waiting')
      
      // 모터 DOWN 명령 전송
      try {
        const needleWs = new WebSocket('ws://192.168.0.122:8765')
        needleWs.onopen = () => {
          console.log('모터 DOWN 명령 전송')
          needleWs.send(JSON.stringify({ cmd: "move", position: 0, mode: "position" })) // 모터 DOWN
          needleWs.close()
        }
      } catch (error) {
        console.error('모터 DOWN 명령 전송 실패:', error)
      }
    }
    
    onStartedChange && onStartedChange(!isStarted)
  }

  const handleCountryChange = (value) => {
    setSelectedCountry(value)
  }

  const handleNeedleTypeChange = (value) => {
    setSelectedNeedleType(value)
  }

  const handleYearChange = (value) => {
    setSelectedYear(value)
  }

  const handleMonthChange = (value) => {
    setSelectedMonth(value)
  }

  const handleDayChange = (value) => {
    setSelectedDay(value)
  }

  const readTipType = readEepromData?.tipType ?? '';
  const readShotCount = readEepromData?.shotCount ?? '';
  const readRawDate = readEepromData ? `Y:${readEepromData.year} M:${readEepromData.month} D:${readEepromData.day}` : '';

  return (
    <Panel title="저장 데이터 설정">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5dvh' }}>
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '20%', fontSize: '1.5dvh', color: '#D1D5DB' }}>국가</label>
            <Select value={selectedCountry} onValueChange={handleCountryChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', width: '100%', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cutera">CUTERA</SelectItem>
                <SelectItem value="ilooda">ILOODA (국내)</SelectItem>
                <SelectItem value="ilooda_export">ILOODA (해외)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '1dvw' }}>
            <label style={{ width: '20%', fontSize: '1.5dvh', color: '#D1D5DB' }}>니들</label>
            <Select value={selectedNeedleType} onValueChange={handleNeedleTypeChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', width: '100%', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getNeedleOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '25%', fontSize: '1.5dvh', color: '#D1D5DB' }}>날짜</label>
          <div style={{ display: 'flex', width: '100%', gap: '0.8dvw' }}>
            <Select value={selectedYear} onValueChange={handleYearChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMonth} onValueChange={handleMonthChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((month) => (
                  <SelectItem key={month} value={month}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedDay} onValueChange={handleDayChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getDayOptions().map((day) => (
                  <SelectItem key={day} value={day}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1dvh' }}>

      <Button
          onClick={handleDataSettingsToggle}
          style={{
            width: '100%',
            fontWeight: 'bold',
            padding: '0.8dvh 0',
            fontSize: '1.8dvh',
            backgroundColor: '#171C26',
            color: 'white',
            border: '1px solid white',
            borderRadius: '0.375rem',
            cursor: 'pointer'
          }}
        >
          {isDataSettingsEnabled ? "LOCK" : "UNLOCK"}
        </Button>
        <Button
          onClick={handleToggle}
          style={{
            width: '100%',
            fontWeight: 'bold',
            padding: '0.8dvh 0',
            fontSize: '1.8dvh',
            backgroundColor: '#171C26',
            color: isStarted ? '#FF5455' : '#4ADE80',
            border: isStarted ? '1px solid #FF5455' : '1px solid #4ADE80',
            borderRadius: '0.375rem',
            cursor: 'pointer'
          }}
        >
          {isStarted ? "STOP" : "START"}
        </Button>



      </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5dvh', borderTop: '1px solid #374151' }}>
          <div style={{ display: 'flex', gap: '2dvw' }}>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
              <label style={{ width: '3dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>TIP TYPE</label>
              <Input type="text" value={readTipType} readOnly style={{ backgroundColor: '#171C26', border: 'none', width: '5dvw', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '1dvw' }}>
              <label style={{ width: '5dvw', fontSize: '1.5dvh', color: '#D1D5DB' }}>SHOT COUNT</label>
              <Input type="text" value={readShotCount} readOnly style={{ backgroundColor: '#171C26', width: '5dvw', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <label style={{ width: '15%', fontSize: '1.5dvh', color: '#D1D5DB' }}>제조일</label>
            <Input type="text" value={readRawDate} readOnly style={{ flex: 1, backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }} />
          </div>
        </div>
      
    </Panel>
  )
}
