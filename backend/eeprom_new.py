import sys
import time
import smbus2
from PyQt5.QtWidgets import QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QTextEdit, QLabel, QComboBox, QSpinBox, QGroupBox

# I2C 설정
I2C_BUS = 1
DEVICE_ADDRESS = 0x50

# TIP TYPE 매핑
TIP_TYPE_MAP = {
    230: "cutera-25&16",
    208: "cutera-1&10", 
    209: "cutera-10",
    210: "cutera-64",
    211: "cutera-25",
    216: "ilooda-25&16",
    217: "ilooda-1&10",
    218: "ilooda-10", 
    219: "ilooda-64",
    220: "ilooda-25"
}

# 제조사 코드 매핑
MAKER_CODE_MAP = {
    4: "제조사 A",
    5: "제조사 B"
}

class I2CReaderApp(QWidget):
    def __init__(self):
        super().__init__()
        self.initUI()

    def initUI(self):
        self.setWindowTitle('EEPROM 데이터 읽기')
        self.setGeometry(100, 100, 600, 400)
        
        # 메인 레이아웃 설정
        main_layout = QVBoxLayout()

        # 제목
        title_label = QLabel("EEPROM 데이터 읽기 (니들 인스펙터)", self)
        title_label.setStyleSheet("font-size: 16px; font-weight: bold; margin: 10px;")
        main_layout.addWidget(title_label)

        # 쓰기 섹션
        write_group = QGroupBox("EEPROM 데이터 쓰기")
        write_layout = QVBoxLayout()
        
        # TIP TYPE 선택
        tip_type_layout = QHBoxLayout()
        tip_type_layout.addWidget(QLabel("TIP TYPE:"))
        self.tipTypeCombo = QComboBox()
        self.tipTypeCombo.addItems([
            "230 - cutera-25&16",
            "208 - cutera-1&10", 
            "209 - cutera-10",
            "210 - cutera-64",
            "211 - cutera-25",
            "216 - ilooda-25&16",
            "217 - ilooda-1&10",
            "218 - ilooda-10", 
            "219 - ilooda-64",
            "220 - ilooda-25"
        ])
        tip_type_layout.addWidget(self.tipTypeCombo)
        write_layout.addLayout(tip_type_layout)
        
        # SHOT COUNT 입력
        shot_count_layout = QHBoxLayout()
        shot_count_layout.addWidget(QLabel("SHOT COUNT:"))
        self.shotCountSpin = QSpinBox()
        self.shotCountSpin.setRange(0, 65535)
        self.shotCountSpin.setValue(0)
        shot_count_layout.addWidget(self.shotCountSpin)
        write_layout.addLayout(shot_count_layout)
        
        # 제조일 입력
        date_layout = QHBoxLayout()
        date_layout.addWidget(QLabel("제조일:"))
        
        self.yearSpin = QSpinBox()
        self.yearSpin.setRange(2000, 2099)
        self.yearSpin.setValue(2025)
        date_layout.addWidget(QLabel("년:"))
        date_layout.addWidget(self.yearSpin)
        
        self.monthSpin = QSpinBox()
        self.monthSpin.setRange(1, 12)
        self.monthSpin.setValue(1)
        date_layout.addWidget(QLabel("월:"))
        date_layout.addWidget(self.monthSpin)
        
        self.daySpin = QSpinBox()
        self.daySpin.setRange(1, 31)
        self.daySpin.setValue(1)
        date_layout.addWidget(QLabel("일:"))
        date_layout.addWidget(self.daySpin)
        
        write_layout.addLayout(date_layout)
        
        # 제조사 코드 선택
        maker_layout = QHBoxLayout()
        maker_layout.addWidget(QLabel("제조사 코드:"))
        self.makerCombo = QComboBox()
        self.makerCombo.addItems(["4 - 제조사 A", "5 - 제조사 B"])
        maker_layout.addWidget(self.makerCombo)
        write_layout.addLayout(maker_layout)
        
        write_group.setLayout(write_layout)
        main_layout.addWidget(write_group)
        
        # 버튼들
        button_layout = QHBoxLayout()
        
        # 쓰기 버튼
        self.writeButton = QPushButton('EEPROM 데이터 쓰기', self)
        self.writeButton.clicked.connect(self.write_data)
        self.writeButton.setStyleSheet("QPushButton { font-size: 14px; padding: 10px; background-color: #4CAF50; color: white; }")
        button_layout.addWidget(self.writeButton)
        
        # 읽기 버튼
        self.readButton = QPushButton('EEPROM 데이터 읽기', self)
        self.readButton.clicked.connect(self.read_data)
        self.readButton.setStyleSheet("QPushButton { font-size: 14px; padding: 10px; background-color: #2196F3; color: white; }")
        button_layout.addWidget(self.readButton)
        
        main_layout.addLayout(button_layout)
        
        # 읽기 결과를 표시할 텍스트 박스
        self.readResultLabel = QLabel("EEPROM 작업 결과:", self)
        self.readResultTextEdit = QTextEdit(self)
        self.readResultTextEdit.setReadOnly(True)
        self.readResultTextEdit.setMinimumHeight(200)
        main_layout.addWidget(self.readResultLabel)
        main_layout.addWidget(self.readResultTextEdit)

        # 윈도우 설정
        self.setLayout(main_layout)

    def read_data(self):
        """
        EEPROM에서 니들 인스펙터 데이터 읽기
        - 0x10: TIP TYPE
        - 0x11~0x12: SHOT COUNT
        - 0x19~0x1B: 제조일 (년, 월, 일)
        - 0x1C: 제조사 코드
        """
        try:
            bus = smbus2.SMBus(I2C_BUS)
            
            # TIP TYPE 읽기 (0x10)
            tip_type = bus.read_byte_data(DEVICE_ADDRESS, 0x10)
            
            # SHOT COUNT 읽기 (0x11~0x12)
            shot_count_bytes = bus.read_i2c_block_data(DEVICE_ADDRESS, 0x11, 2)
            shot_count = shot_count_bytes[0] << 8 | shot_count_bytes[1]
            
            # 제조일 읽기 (0x19~0x1B)
            manufacture_date = bus.read_i2c_block_data(DEVICE_ADDRESS, 0x19, 3)
            year = 2000 + manufacture_date[0]
            month = manufacture_date[1]
            day = manufacture_date[2]
            
            # 제조사 코드 읽기 (0x1C)
            maker_code = bus.read_byte_data(DEVICE_ADDRESS, 0x1C)
            
            bus.close()
            
            # TIP TYPE 해석
            tip_type_name = TIP_TYPE_MAP.get(tip_type, f"알 수 없는 타입 ({tip_type})")
            
            # 제조사 코드 해석
            maker_name = MAKER_CODE_MAP.get(maker_code, f"알 수 없는 제조사 ({maker_code})")
            
            # 결과 표시
            result_text = f"""
=== EEPROM 데이터 읽기 결과 ===

🔹 TIP TYPE (0x10)
   값: {tip_type}
   타입: {tip_type_name}

🔹 SHOT COUNT (0x11~0x12)
   값: {shot_count}

🔹 제조일 (0x19~0x1B)
   날짜: {year}-{month:02d}-{day:02d}
   원시 데이터: [{manufacture_date[0]}, {manufacture_date[1]}, {manufacture_date[2]}]

🔹 제조사 코드 (0x1C)
   값: {maker_code}
   제조사: {maker_name}

=== 읽기 완료 ===
            """.strip()
            
            self.readResultTextEdit.setText(result_text)
            print(f"[EEPROM READ] TIP_TYPE={tip_type}, SHOT_COUNT={shot_count}, DATE={year}-{month:02d}-{day:02d}, MAKER={maker_code}")
            
        except Exception as e:
            error_text = f"""
=== EEPROM 읽기 오류 ===

오류 내용: {str(e)}

가능한 원인:
1. I2C 연결 문제
2. EEPROM 장치가 연결되지 않음
3. 권한 부족 (sudo 사용 필요)
4. I2C 주소 오류 (0x50)

해결 방법:
- i2cdetect -y 1 명령으로 I2C 장치 확인
- sudo 권한으로 실행
            """.strip()
            
            self.readResultTextEdit.setText(error_text)
            print(f"[EEPROM ERROR] {str(e)}")

    def write_data(self):
        """
        EEPROM에 니들 인스펙터 데이터 쓰기
        - 0x10: TIP TYPE
        - 0x11~0x12: SHOT COUNT
        - 0x19~0x1B: 제조일 (년, 월, 일)
        - 0x1C: 제조사 코드
        """
        try:
            # UI에서 데이터 가져오기
            tip_type = int(self.tipTypeCombo.currentText().split(' - ')[0])
            shot_count = self.shotCountSpin.value()
            year = self.yearSpin.value()
            month = self.monthSpin.value()
            day = self.daySpin.value()
            maker_code = int(self.makerCombo.currentText().split(' - ')[0])
            
            # 데이터 검증
            if year < 2000 or year > 2099:
                raise ValueError("년도는 2000-2099 범위에 있어야 합니다.")
            if month < 1 or month > 12:
                raise ValueError("월은 1-12 범위에 있어야 합니다.")
            if day < 1 or day > 31:
                raise ValueError("일은 1-31 범위에 있어야 합니다.")
            
            bus = smbus2.SMBus(I2C_BUS)
            
            # TIP TYPE 쓰기 (0x10)
            bus.write_byte_data(DEVICE_ADDRESS, 0x10, tip_type)
            time.sleep(0.1)
            
            # SHOT COUNT 쓰기 (0x11~0x12) - 2바이트
            bus.write_i2c_block_data(DEVICE_ADDRESS, 0x11, [shot_count >> 8, shot_count & 0xFF])
            time.sleep(0.1)
            
            # 제조일 쓰기 (0x19~0x1B) - 년도는 2000년 기준으로 오프셋
            bus.write_i2c_block_data(DEVICE_ADDRESS, 0x19, [year - 2000, month, day])
            time.sleep(0.1)
            
            # 제조사 코드 쓰기 (0x1C)
            bus.write_byte_data(DEVICE_ADDRESS, 0x1C, maker_code)
            time.sleep(0.1)
            
            bus.close()
            
            # TIP TYPE 해석
            tip_type_name = TIP_TYPE_MAP.get(tip_type, f"알 수 없는 타입 ({tip_type})")
            
            # 제조사 코드 해석
            maker_name = MAKER_CODE_MAP.get(maker_code, f"알 수 없는 제조사 ({maker_code})")
            
            # 성공 메시지 표시
            success_text = f"""
=== EEPROM 데이터 쓰기 성공 ===

✅ TIP TYPE (0x10)
   쓴 값: {tip_type}
   타입: {tip_type_name}

✅ SHOT COUNT (0x11~0x12)
   쓴 값: {shot_count}

✅ 제조일 (0x19~0x1B)
   쓴 날짜: {year}-{month:02d}-{day:02d}
   원시 데이터: [{year-2000}, {month}, {day}]

✅ 제조사 코드 (0x1C)
   쓴 값: {maker_code}
   제조사: {maker_name}

=== 쓰기 완료 ===

📝 검증을 위해 '데이터 읽기' 버튼을 눌러주세요.
            """.strip()
            
            self.readResultTextEdit.setText(success_text)
            print(f"[EEPROM WRITE] TIP_TYPE={tip_type}, SHOT_COUNT={shot_count}, DATE={year}-{month:02d}-{day:02d}, MAKER={maker_code}")
            
        except Exception as e:
            error_text = f"""
=== EEPROM 쓰기 오류 ===

오류 내용: {str(e)}

가능한 원인:
1. I2C 연결 문제
2. EEPROM 장치가 연결되지 않음
3. 권한 부족 (sudo 사용 필요)
4. I2C 주소 오류 (0x50)
5. 데이터 범위 오류

해결 방법:
- i2cdetect -y 1 명령으로 I2C 장치 확인
- sudo 권한으로 실행
- 입력 데이터 범위 확인
            """.strip()
            
            self.readResultTextEdit.setText(error_text)
            print(f"[EEPROM WRITE ERROR] {str(e)}")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = I2CReaderApp()
    window.show()
    sys.exit(app.exec_())
