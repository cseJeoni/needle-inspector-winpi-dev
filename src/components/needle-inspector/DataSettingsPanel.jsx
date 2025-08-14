"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"
import { Input } from "./Input"
import lockIcon from '../../assets/icon/lock.png';
import unlockIcon from '../../assets/icon/unlock.png';
import { 
  getCountryOptions,
  getNeedleOptions,
  getId,
  isCacheReady,
  initializeCache
} from '../../utils/csvCache';

export default function DataSettingsPanel({
  makerCode,
  onWorkStatusChange,
  isStarted,
  onStartedChange,
  readEepromData,
  onReadEepromDataChange,
  needleTipConnected,
  websocket, // 메인 WebSocket 연결
  isWsConnected, // WebSocket 연결 상태
  onWaitingEepromReadChange // EEPROM 읽기 대기 상태 변경 함수
}) {
  // isStarted와 readEepromData는 이제 props로 받아서 사용
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDay, setSelectedDay] = useState("")
  const [selectedCountry, setSelectedCountry] = useState("")
  const [selectedNeedleType, setSelectedNeedleType] = useState("")
  const [mtrVersion, setMtrVersion] = useState('2.0'); // MTR 버전 상태 추가, 기본값 '2.0'
  
  // 저장 데이터 설정 활성화 상태 (기본값: 비활성화)
  const [isDataSettingsEnabled, setIsDataSettingsEnabled] = useState(false)
  
  // CSV 캐시 준비 상태
  const [cacheReady, setCacheReady] = useState(false)

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

  // 니들 옵션 생성 (CSV 캐시 사용)
  const getNeedleOptionsForUI = () => {
    if (!cacheReady || !selectedCountry) return [];
    return getNeedleOptions(mtrVersion, selectedCountry);
  };
  
  // 국가 옵션 생성 (CSV 캐시 사용)
  const getCountryOptionsForUI = () => {
    if (!cacheReady) return [];
    return getCountryOptions(mtrVersion);
  };

  // TIP TYPE 계산 함수 (CSV 캐시 사용)
  const calculateTipType = () => {
    if (!cacheReady || !selectedCountry || !selectedNeedleType) return null;
    
    // CSV 캐시에서 ID 조회
    const id = getId(mtrVersion, selectedCountry, selectedNeedleType);
    
    // ID가 숫자 형태라면 그대로 반환, 아니면 null
    const numericId = parseInt(id);
    return isNaN(numericId) ? null : numericId;
  }

  // CSV 캐시 초기화 (앱 시작 시 1회)
  useEffect(() => {
    const loadCsvDataAsync = async () => {
      console.log('DataSettingsPanel: 마운트됨, CSV 데이터 로딩 시도...');
      if (window.api && typeof window.api.loadCsvData === 'function') {
        try {
          const csvData = await window.api.loadCsvData(); // 비동기로 CSV 데이터 로드
          console.log('CSV 데이터 로드 완료:', csvData);
          
          // 데이터 형식을 csvCache가 기대하는 형식으로 변환
          const formattedData = {
            '2.0': csvData.mtr2 || [],
            '4.0': csvData.mtr4 || []
          };
          
          initializeCache(formattedData); // 로드된 데이터로 캐시 초기화
          
          // 캐시 초기화 후, 상태 업데이트하여 UI 리렌더링
          if (isCacheReady()) {
            console.log('캐시 준비 완료, UI 상태 업데이트');
            setCacheReady(true);
            const countryOptions = getCountryOptions(mtrVersion);
            if (countryOptions.length > 0) {
              setSelectedCountry(countryOptions[0].value);
              const needleOptions = getNeedleOptions(mtrVersion, countryOptions[0].value);
              if (needleOptions.length > 0) {
                setSelectedNeedleType(needleOptions[0].value);
              }
            }
          } else {
            console.warn('캐시 준비 실패');
          }
        } catch (error) {
          console.error('CSV 데이터 로드 중 오류 발생:', error);
        }
      } else {
        console.error('`window.api.loadCsvData` 함수를 찾을 수 없습니다. preload.js를 확인하세요.');
      }
    };
    
    loadCsvDataAsync();
  }, []); // 빈 배열을 전달하여 컴포넌트 마운트 시 1회만 실행

  // 초기값 설정
  useEffect(() => {
    setSelectedYear(String(currentYear))
    setSelectedMonth(currentMonth)
    setSelectedDay(currentDay)
  }, [])

  // MTR 버전이 변경될 때 국가와 니들 옵션 초기화
  useEffect(() => {
    if (!cacheReady) return;
    
    const countryOptions = getCountryOptions(mtrVersion);
    if (countryOptions.length > 0) {
      const firstCountry = countryOptions[0].value;
      setSelectedCountry(firstCountry);
      
      const needleOptions = getNeedleOptions(mtrVersion, firstCountry);
      if (needleOptions.length > 0) {
        setSelectedNeedleType(needleOptions[0].value);
      } else {
        setSelectedNeedleType("");
      }
    } else {
      setSelectedCountry("");
      setSelectedNeedleType("");
    }
  }, [mtrVersion, cacheReady]);
  
  // 국가가 변경될 때 니들 종류 초기화
  useEffect(() => {
    if (!cacheReady || !selectedCountry) return;
    
    const needleOptions = getNeedleOptions(mtrVersion, selectedCountry);
    if (needleOptions.length > 0) {
      // 현재 선택된 니들이 새 옵션에 없으면 첫번째 옵션으로 설정
      if (!needleOptions.find(opt => opt.value === selectedNeedleType)) {
        setSelectedNeedleType(needleOptions[0].value);
      }
    } else {
      setSelectedNeedleType("");
    }
  }, [selectedCountry, mtrVersion, cacheReady]);

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

  // EEPROM 읽기 함수 (Promise 기반 동기화)
  const readFromEEPROM = () => {
    return new Promise((resolve, reject) => {
      if (!websocket || !isWsConnected) {
        console.error('WebSocket 연결되지 않음 - EEPROM 읽기 실패');
        onReadEepromDataChange && onReadEepromDataChange(null);
        reject(new Error('WebSocket 연결 없음'));
        return;
      }

      console.log("EEPROM 읽기 명령 전송");
      onWaitingEepromReadChange && onWaitingEepromReadChange(true);
      
      // 응답 대기용 리스너 등록
      const handleResponse = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.type === 'eeprom_read') {
            websocket.removeEventListener('message', handleResponse);
            onWaitingEepromReadChange && onWaitingEepromReadChange(false);
            
            if (response.result && response.result.success) {
              console.log('✅ EEPROM 읽기 성공:', response.result);
              onReadEepromDataChange && onReadEepromDataChange(response.result);
              resolve(response.result);
            } else {
              console.error('⚠️ EEPROM 읽기 실패:', response.result?.error);
              onReadEepromDataChange && onReadEepromDataChange(null);
              reject(new Error(response.result?.error || 'EEPROM 읽기 실패'));
            }
          }
        } catch (err) {
          console.error('EEPROM 읽기 응답 파싱 오류:', err);
        }
      };
      
      websocket.addEventListener('message', handleResponse);
      
      const readCommand = { 
        cmd: "eeprom_read",
        mtrVersion: mtrVersion,
        country: selectedCountry
      };
      console.log('[DEBUG] EEPROM 읽기 명령 전송:', readCommand);
      websocket.send(JSON.stringify(readCommand));
      
      // 타임아웃 설정 (5초)
      setTimeout(() => {
        websocket.removeEventListener('message', handleResponse);
        onWaitingEepromReadChange && onWaitingEepromReadChange(false);
        reject(new Error('EEPROM 읽기 타임아웃'));
      }, 5000);
    });
  };

  // EEPROM에 데이터 쓰기 함수 (Promise 기반 동기화)
  const writeToEEPROM = () => {
    return new Promise((resolve, reject) => {
      const tipType = calculateTipType();
      
      const eepromData = {
        cmd: "eeprom_write",
        tipType: tipType,
        shotCount: 0, // 무조건 0
        year: parseInt(selectedYear),
        month: parseInt(selectedMonth),
        day: parseInt(selectedDay),
        makerCode: 4,
        mtrVersion: mtrVersion,
        country: selectedCountry
      };
      
      console.log('[DEBUG] EEPROM 쓰기 명령 전송:', eepromData);
      
      if (!websocket || !isWsConnected) {
        console.error('WebSocket 연결되지 않음 - EEPROM 쓰기 실패');
        onWorkStatusChange && onWorkStatusChange('disconnected');
        reject(new Error('WebSocket 연결 없음'));
        return;
      }
      
      // 응답 대기용 리스너 등록
      const handleResponse = (event) => {
        try {
          const response = JSON.parse(event.data);
          if (response.type === 'eeprom_write') {
            websocket.removeEventListener('message', handleResponse);
            
            if (response.result && response.result.success) {
              console.log('✅ EEPROM 쓰기 성공:', response.result);
              onWorkStatusChange && onWorkStatusChange('write_success');
              resolve(response.result);
            } else {
              console.error('⚠️ EEPROM 쓰기 실패:', response.result?.error);
              onWorkStatusChange && onWorkStatusChange('write_failed');
              reject(new Error(response.result?.error || 'EEPROM 쓰기 실패'));
            }
          }
        } catch (err) {
          console.error('EEPROM 쓰기 응답 파싱 오류:', err);
        }
      };
      
      websocket.addEventListener('message', handleResponse);
      console.log('EEPROM 쓰기 명령 전송');
      websocket.send(JSON.stringify(eepromData));
      
      // 타임아웃 설정 (5초)
      setTimeout(() => {
        websocket.removeEventListener('message', handleResponse);
        reject(new Error('EEPROM 쓰기 타임아웃'));
      }, 5000);
    });
  };
  
  // 저장 데이터 설정 활성화/비활성화 토글 함수
  const handleDataSettingsToggle = () => {
    setIsDataSettingsEnabled(!isDataSettingsEnabled)  }

  const handleToggle = async () => {
    const tipType = calculateTipType()
    
    if (!isStarted) {
      // 니들팁이 연결되지 않은 상태에서는 START 버튼 동작 차단
      if (!needleTipConnected) {
        console.log('니들팁이 연결되지 않아 START 버튼 동작을 차단합니다.')
        onWorkStatusChange && onWorkStatusChange('disconnected')
        return // 조기 종료
      }
      
      try {
        console.log('🚀 동기 EEPROM 처리 시작')
        // START 시 상태 변경 제거 - EEPROM 쓰기 완료 시에만 상태 변경
        
        // 1단계: 니들 UP 명령 전송
        if (websocket && isWsConnected) {
          console.log('1️⃣ 니들 UP 명령 전송')
          websocket.send(JSON.stringify({ cmd: "move", position: 840, mode: "position" }))
        } else {
          console.error('WebSocket 연결되지 않음 - 니들 UP 명령 실패')
          return
        }
        
        // 2단계: EEPROM 쓰기 완료까지 대기
        console.log('2️⃣ EEPROM 쓰기 시작 - 응답 대기 중...')
        await writeToEEPROM()
        console.log('✅ EEPROM 쓰기 완료')
        
        // 3단계: EEPROM 읽기 완료까지 대기
        console.log('3️⃣ EEPROM 읽기 시작 - 응답 대기 중...')
        await readFromEEPROM()
        console.log('✅ EEPROM 읽기 완료')
        
        // 4단계: 판정 버튼 활성화 (write_success 상태 유지)
        console.log('4️⃣ 판정 버튼 활성화 준비 완료 (저장 완료 상태 유지)')
        onStartedChange && onStartedChange(true)
        
        console.log('🎉 동기 EEPROM 처리 완료 - 판정 버튼 활성화됨')
        
      } catch (error) {
        console.error('❌ 동기 EEPROM 처리 실패:', error.message)
        onWorkStatusChange && onWorkStatusChange('write_failed')
        // 실패 시 START 상태를 유지하지 않음
        return
      }
    } else {
      // STOP 버튼을 눌렀을 때 모터 DOWN 명령 전송 후 대기 상태로 복귀
      onWorkStatusChange && onWorkStatusChange('waiting')
      onWaitingEepromReadChange && onWaitingEepromReadChange(false) // EEPROM 읽기 대기 상태 초기화
      
      // 모터 DOWN 명령 전송 (메인 WebSocket 사용)
      if (websocket && isWsConnected) {
        console.log('모터 DOWN 명령 전송')
        websocket.send(JSON.stringify({ cmd: "move", position: 0, mode: "position" }))
      } else {
        console.error('WebSocket 연결되지 않음 - 모터 DOWN 명령 실패')
      }
      
      onStartedChange && onStartedChange(false)
    }
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
    <Panel title={
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h2 className="text-lg font-bold">저장 데이터 설정</h2>
        <img
          src={isDataSettingsEnabled ? unlockIcon : lockIcon}
          alt={isDataSettingsEnabled ? 'Unlocked' : 'Locked'}
          style={{ cursor: 'pointer', height: '1.25rem' }} // h-5 equivalent
          onClick={handleDataSettingsToggle}
          title={isDataSettingsEnabled ? '설정 잠금' : '설정 잠금 해제'}
        />
      </div>
    }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5dvh' }}>
        <div style={{ display: 'flex', gap: '0.2dvw', marginBottom: '0.3dvh' }}>
            <Button 
                onClick={() => {
                  console.log('[DEBUG] MTR 2.0 버튼 클릭');
                  setMtrVersion('2.0');
                }}
                disabled={!isDataSettingsEnabled}
                style={{
                    flex: 1,
                    backgroundColor: mtrVersion === '2.0' ? '#4A90E2' : '#171C26',
                    color: 'white',
                    border: `1px solid ${mtrVersion === '2.0' ? '#4A90E2' : '#374151'}`,
                    fontSize: '1.5dvh',
                    padding: '0.8dvh 0',
                }}
            >
                MTR 2.0
            </Button>
            <Button 
                onClick={() => {
                  console.log('[DEBUG] MTR 4.0 버튼 클릭');
                  setMtrVersion('4.0');
                }}
                disabled={!isDataSettingsEnabled}
                style={{
                    flex: 1,
                    backgroundColor: mtrVersion === '4.0' ? '#4A90E2' : '#171C26',
                    color: 'white',
                    border: `1px solid ${mtrVersion === '4.0' ? '#4A90E2' : '#374151'}`,
                    fontSize: '1.5dvh',
                    padding: '0.8dvh 0',
                }}
            >
                MTR 4.0
            </Button>
        </div>
        <div style={{ display: 'flex', gap: '0.5dvw' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.5dvw' }}>
            <label style={{ width: '20%', fontSize: '1.5dvh', color: '#D1D5DB' }}>국가</label>
            <Select value={selectedCountry} onValueChange={handleCountryChange} disabled={isStarted || !isDataSettingsEnabled}>
              <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', width: '100%', height: '3.5dvh' }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getCountryOptionsForUI().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
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
                {getNeedleOptionsForUI().map((option) => (
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
