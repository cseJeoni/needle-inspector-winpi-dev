"use client"

import { useState, useEffect } from "react"
import Panel from "./Panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./Select"
import { Button } from "./Button"

export default function DataSettingsPanel() {
  const [isStarted, setIsStarted] = useState(false)
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedDay, setSelectedDay] = useState("")

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

  // 일 옵션 생성
  const getDayOptions = () => {
    if (!selectedYear || !selectedMonth) return []
    const daysInMonth = getDaysInMonth(Number.parseInt(selectedYear), Number.parseInt(selectedMonth))
    return Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"))
  }

  // 초기값 설정
  useEffect(() => {
    setSelectedYear(String(currentYear))
    setSelectedMonth(currentMonth)
    setSelectedDay(currentDay)
  }, [])

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

  const handleToggle = () => {
    setIsStarted(!isStarted)
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

  return (
    <Panel title="저장 데이터 설정">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '25%', fontSize: '1.5dvh', color: '#D1D5DB' }}>국가 선택</label>
          <Select defaultValue="ilooda" disabled={isStarted}>
            <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ilooda">ILOODA(국내)</SelectItem>
              <SelectItem value="global">Global</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '25%', fontSize: '1.5dvh', color: '#D1D5DB' }}>니들 종류</label>
          <Select defaultValue="25&16" disabled={isStarted}>
            <SelectTrigger style={{ backgroundColor: '#171C26', border: 'none', color: 'white', fontSize: '1.2dvh', height: '3.5dvh' }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25&16">25&16 PIN</SelectItem>
              <SelectItem value="49">49 PIN</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <label style={{ width: '25%', fontSize: '1.5dvh', color: '#D1D5DB' }}>날짜</label>
          <div style={{ display: 'flex', width: '100%', gap: '0.8dvw' }}>
            <Select value={selectedYear} onValueChange={handleYearChange} disabled={isStarted}>
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
            <Select value={selectedMonth} onValueChange={handleMonthChange} disabled={isStarted}>
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
            <Select value={selectedDay} onValueChange={handleDayChange} disabled={isStarted}>
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
      <div style={{ flexGrow: 1 }} />
      <Button
        onClick={handleToggle}
        style={{
          width: '100%',
          fontWeight: 'bold',
          padding: '1dvh 0',
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
    </Panel>
  )
}
