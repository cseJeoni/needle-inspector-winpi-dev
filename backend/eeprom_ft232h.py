"""
ws_server.py EEPROM 함수 FT232H 변환
- 기존 SMBus 방식의 EEPROM 통신 함수를 FT232H(pyftdi) 방식으로 변경
- 주소, 오프셋, 필드 구조는 ws_server.py 기준 그대로 유지
"""

import time
from pyftdi.i2c import I2cController, I2cIOError

# FT232H 설정
FTDI_URL = 'ftdi://ftdi:232h/1'

# ws_server.py와 동일한 EEPROM 설정 유지
MTR20_EEPROM_ADDRESS = 0x50  # 기존 그대로
MTR20_CLASSYS_OFFSET = 0x10  # 기존 그대로
MTR20_CUTERA_OFFSET = 0x80   # 기존 그대로

MTR40_EEPROM_ADDRESS = 0x51  # 기존 그대로
MTR40_OFFSET = 0x70          # 기존 그대로


def write_eeprom_mtr20(tip_type, shot_count, year, month, day, maker_code, country="CLASSYS", inspector_code=None, judge_result=None, daily_serial=None):
    """
    MTR 2.0용 EEPROM 쓰기 함수 (FT232H 방식)
    ※ ws_server.py의 write_eeprom_mtr20() 함수와 완전히 동일한 로직
    ※ SMBus → FT232H 통신 방식만 변경
    
    Args:
        tip_type: TIP ID (1바이트)
        shot_count: Shot Count (2바이트)
        year: 제조 년도
        month: 제조 월
        day: 제조 일
        maker_code: 제조업체 코드 (1바이트)
        country: 국가 ("CLASSYS" 또는 "CUTERA")
        inspector_code: 검사기 코드 (문자열, 선택적)
        judge_result: 판정 결과 (PASS=1, NG=0, 선택적)
        daily_serial: 일일 시리얼 번호 (정수, 선택적)
    
    EEPROM 설정:
        - CLASSYS: 주소 0x50, 오프셋 0x10
        - CUTERA: 주소 0x50, 오프셋 0x80
    
    레이아웃:
        offset + 0: TIP TYPE (1바이트)
        offset + 1~2: SHOT COUNT (2바이트, big-endian)
        offset + 3~4: Reserved
        offset + 5: 검사기 코드 (1바이트)
        offset + 6: 판정 결과 (1바이트: PASS=0x01, NG=0x00)
        offset + 7~8: 일일 시리얼 번호 (2바이트, big-endian)
        offset + 9~11: 제조 년/월/일 (3바이트)
        offset + 12: 제조업체 (1바이트)
    """
    # 국가에 따른 오프셋 설정 (ws_server.py와 동일)
    eeprom_address = MTR20_EEPROM_ADDRESS
    offset = MTR20_CUTERA_OFFSET if country == "CUTERA" else MTR20_CLASSYS_OFFSET

    i2c = I2cController()
    
    try:
        # FT232H 연결
        i2c.configure(FTDI_URL)
        slave = i2c.get_port(eeprom_address)

        # TIP ID (offset + 0)
        # 기존: bus.write_byte_data(eeprom_address, offset + 0, tip_type)
        slave.write_to(offset + 0, [tip_type])
        time.sleep(0.01)

        # SHOT COUNT (offset + 1: H, offset + 2: L) - big-endian
        # 기존: bus.write_byte_data(eeprom_address, offset + 1, (shot_count >> 8) & 0xFF)
        slave.write_to(offset + 1, [(shot_count >> 8) & 0xFF])
        time.sleep(0.01)
        # 기존: bus.write_byte_data(eeprom_address, offset + 2, shot_count & 0xFF)
        slave.write_to(offset + 2, [shot_count & 0xFF])
        time.sleep(0.01)

        # 검사기 코드 (offset + 5) - 문자열을 ASCII 값으로 변환
        if inspector_code is not None:
            inspector_byte = ord(inspector_code[0]) if inspector_code else 0x41  # 기본값 'A'
            # 기존: bus.write_byte_data(eeprom_address, offset + 5, inspector_byte & 0xFF)
            slave.write_to(offset + 5, [inspector_byte & 0xFF])
            time.sleep(0.01)

        # 판정 결과 (offset + 6)
        if judge_result is not None:
            judge_byte = 0x01 if judge_result == "PASS" else 0x00
            # 기존: bus.write_byte_data(eeprom_address, offset + 6, judge_byte)
            slave.write_to(offset + 6, [judge_byte])
            time.sleep(0.01)

        # 일일 시리얼 번호 (offset + 7~8) - 2바이트 big-endian
        if daily_serial is not None:
            # 기존: bus.write_byte_data(eeprom_address, offset + 7, (daily_serial >> 8) & 0xFF)
            slave.write_to(offset + 7, [(daily_serial >> 8) & 0xFF])
            time.sleep(0.01)
            # 기존: bus.write_byte_data(eeprom_address, offset + 8, daily_serial & 0xFF)
            slave.write_to(offset + 8, [daily_serial & 0xFF])
            time.sleep(0.01)

        # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
        # 기존: bus.write_byte_data(eeprom_address, offset + 9, (year - 2000) & 0xFF)
        slave.write_to(offset + 9, [(year - 2000) & 0xFF])
        time.sleep(0.01)
        # 기존: bus.write_byte_data(eeprom_address, offset + 10, month & 0xFF)
        slave.write_to(offset + 10, [month & 0xFF])
        time.sleep(0.01)
        # 기존: bus.write_byte_data(eeprom_address, offset + 11, day & 0xFF)
        slave.write_to(offset + 11, [day & 0xFF])
        time.sleep(0.01)

        # MAKER CODE (offset + 12)
        # 기존: bus.write_byte_data(eeprom_address, offset + 12, maker_code & 0xFF)
        slave.write_to(offset + 12, [maker_code & 0xFF])
        time.sleep(0.01)

        # 기존: bus.close()
        i2c.terminate()
        return {"success": True, "message": f"MTR 2.0 {country} EEPROM 쓰기 성공 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X})"}

    except Exception as e:
        if i2c.configured:
            i2c.terminate()
        return {"success": False, "error": f"EEPROM 쓰기 실패: {e}"}


def read_eeprom_mtr20(country="CLASSYS"):
    """
    MTR 2.0용 EEPROM 읽기 함수 (FT232H 방식)
    ※ ws_server.py의 read_eeprom_mtr20() 함수와 완전히 동일한 로직
    ※ SMBus → FT232H 통신 방식만 변경
    
    Args:
        country: 국가 ("CLASSYS" 또는 "CUTERA")
    
    EEPROM 설정:
        - CLASSYS: 주소 0x50, 오프셋 0x10
        - CUTERA: 주소 0x50, 오프셋 0x80
    """
    # 국가에 따른 오프셋 설정 (ws_server.py와 동일)
    eeprom_address = MTR20_EEPROM_ADDRESS
    offset = MTR20_CUTERA_OFFSET if country == "CUTERA" else MTR20_CLASSYS_OFFSET

    i2c = I2cController()
    max_retries = 3

    for attempt in range(max_retries):
        try:
            # FT232H 연결
            i2c.configure(FTDI_URL)
            slave = i2c.get_port(eeprom_address)

            # TIP ID (offset + 0)
            # 기존: tip_type = bus.read_byte_data(eeprom_address, offset + 0)
            tip_type = slave.read_from(offset + 0, 1)[0]

            # SHOT COUNT (offset + 1=H, offset + 2=L)
            # 기존: shot = bus.read_i2c_block_data(eeprom_address, offset + 1, 2)
            shot = slave.read_from(offset + 1, 2)
            shot_count = (shot[0] << 8) | shot[1]

            # DATE: offset + 9=YEAR, offset + 10=MONTH, offset + 11=DAY
            # 기존: year_off = bus.read_byte_data(eeprom_address, offset + 9)
            year_off = slave.read_from(offset + 9, 1)[0]
            # 기존: month = bus.read_byte_data(eeprom_address, offset + 10)
            month = slave.read_from(offset + 10, 1)[0]
            # 기존: day = bus.read_byte_data(eeprom_address, offset + 11)
            day = slave.read_from(offset + 11, 1)[0]
            year = 2000 + year_off

            # MAKER CODE (offset + 12)
            # 기존: maker_code = bus.read_byte_data(eeprom_address, offset + 12)
            maker_code = slave.read_from(offset + 12, 1)[0]
            
            # 검사기 코드 (offset + 5)
            # 기존: inspector_code = bus.read_byte_data(eeprom_address, offset + 5)
            inspector_code = slave.read_from(offset + 5, 1)[0]
            inspector_char = chr(inspector_code) if 32 <= inspector_code <= 126 else 'A'
            
            # 판정 결과 (offset + 6)
            # 기존: judge_result = bus.read_byte_data(eeprom_address, offset + 6)
            judge_result = slave.read_from(offset + 6, 1)[0]
            judge_str = 'PASS' if judge_result == 1 else 'NG' if judge_result == 0 else 'UNKNOWN'
            
            # 일일 시리얼 번호 (offset + 7=H, offset + 8=L)
            # 기존: daily_serial_bytes = bus.read_i2c_block_data(eeprom_address, offset + 7, 2)
            daily_serial_bytes = slave.read_from(offset + 7, 2)
            daily_serial = (daily_serial_bytes[0] << 8) | daily_serial_bytes[1]

            # 기존: bus.close()
            i2c.terminate()
            
            return {
                "success": True,
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code,
                "inspectorCode": inspector_char,
                "judgeResult": judge_str,
                "dailySerial": daily_serial,
                "mtrVersion": "2.0",
                "country": country,
                "eepromAddress": f"0x{eeprom_address:02X}",
                "offset": f"0x{offset:02X}"
            }

        except Exception as e:
            print(f"[ERROR] MTR 2.0 {country} EEPROM 읽기 시도 {attempt + 1}/{max_retries} 실패 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X}): {e}")
            if i2c.configured:
                i2c.terminate()
            if attempt < max_retries - 1:
                time.sleep(0.1)
            else:
                return {"success": False, "error": f"EEPROM 읽기 실패: {e}"}


def write_eeprom_mtr40(tip_type, shot_count, year, month, day, maker_code, inspector_code=None, judge_result=None, daily_serial=None):
    """
    MTR 4.0용 EEPROM 쓰기 함수 (FT232H 방식)
    ※ ws_server.py의 write_eeprom_mtr40() 함수와 완전히 동일한 로직
    ※ SMBus → FT232H 통신 방식만 변경
    
    EEPROM 설정:
        - 주소: 0x51
        - 오프셋: 0x70
    
    레이아웃:
        offset + 0: TIP TYPE (1바이트)
        offset + 1~2: SHOT COUNT (2바이트, big-endian)
        offset + 3~4: Reserved
        offset + 5: 검사기 코드 (1바이트)
        offset + 6: 판정 결과 (1바이트: PASS=0x01, NG=0x00)
        offset + 7~8: 일일 시리얼 번호 (2바이트, big-endian)
        offset + 9~11: 제조 년/월/일 (3바이트)
        offset + 12: 제조업체 (1바이트)
    """
    eeprom_address = MTR40_EEPROM_ADDRESS
    offset = MTR40_OFFSET

    i2c = I2cController()
    
    try:
        # FT232H 연결
        i2c.configure(FTDI_URL)
        slave = i2c.get_port(eeprom_address)

        # TIP ID (offset + 0)
        slave.write_to(offset + 0, [tip_type])
        time.sleep(0.01)

        # SHOT COUNT (offset + 1: H, offset + 2: L)
        slave.write_to(offset + 1, [(shot_count >> 8) & 0xFF])
        time.sleep(0.01)
        slave.write_to(offset + 2, [shot_count & 0xFF])
        time.sleep(0.01)

        # 검사기 코드 (offset + 5)
        if inspector_code is not None:
            inspector_byte = ord(inspector_code[0]) if inspector_code else 0x41
            slave.write_to(offset + 5, [inspector_byte & 0xFF])
            time.sleep(0.01)

        # 판정 결과 (offset + 6)
        if judge_result is not None:
            judge_byte = 0x01 if judge_result == "PASS" else 0x00
            slave.write_to(offset + 6, [judge_byte])
            time.sleep(0.01)

        # 일일 시리얼 번호 (offset + 7~8)
        if daily_serial is not None:
            slave.write_to(offset + 7, [(daily_serial >> 8) & 0xFF])
            time.sleep(0.01)
            slave.write_to(offset + 8, [daily_serial & 0xFF])
            time.sleep(0.01)

        # DATE
        slave.write_to(offset + 9, [(year - 2000) & 0xFF])
        time.sleep(0.01)
        slave.write_to(offset + 10, [month & 0xFF])
        time.sleep(0.01)
        slave.write_to(offset + 11, [day & 0xFF])
        time.sleep(0.01)

        # MAKER CODE
        slave.write_to(offset + 12, [maker_code & 0xFF])
        time.sleep(0.01)

        i2c.terminate()
        return {"success": True, "message": f"MTR 4.0 EEPROM 쓰기 성공 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X})"}

    except Exception as e:
        if i2c.configured:
            i2c.terminate()
        return {"success": False, "error": f"EEPROM 쓰기 실패: {e}"}


def read_eeprom_mtr40():
    """
    MTR 4.0용 EEPROM 읽기 함수 (FT232H 방식)
    ※ ws_server.py의 read_eeprom_mtr40() 함수와 완전히 동일한 로직
    ※ SMBus → FT232H 통신 방식만 변경
    """
    eeprom_address = MTR40_EEPROM_ADDRESS
    offset = MTR40_OFFSET

    i2c = I2cController()
    max_retries = 3

    for attempt in range(max_retries):
        try:
            # FT232H 연결
            i2c.configure(FTDI_URL)
            slave = i2c.get_port(eeprom_address)

            # TIP ID (offset + 0)
            tip_type = slave.read_from(offset + 0, 1)[0]

            # SHOT COUNT (offset + 1=H, offset + 2=L)
            shot = slave.read_from(offset + 1, 2)
            shot_count = (shot[0] << 8) | shot[1]

            # DATE
            year_off = slave.read_from(offset + 9, 1)[0]
            month = slave.read_from(offset + 10, 1)[0]
            day = slave.read_from(offset + 11, 1)[0]
            year = 2000 + year_off

            # MAKER CODE
            maker_code = slave.read_from(offset + 12, 1)[0]
            
            # 검사기 코드
            inspector_code = slave.read_from(offset + 5, 1)[0]
            inspector_char = chr(inspector_code) if 32 <= inspector_code <= 126 else 'A'
            
            # 판정 결과
            judge_result = slave.read_from(offset + 6, 1)[0]
            judge_str = 'PASS' if judge_result == 1 else 'NG' if judge_result == 0 else 'UNKNOWN'
            
            # 일일 시리얼 번호
            daily_serial_bytes = slave.read_from(offset + 7, 2)
            daily_serial = (daily_serial_bytes[0] << 8) | daily_serial_bytes[1]

            i2c.terminate()
            
            return {
                "success": True,
                "tipType": tip_type,
                "shotCount": shot_count,
                "year": year,
                "month": month,
                "day": day,
                "makerCode": maker_code,
                "inspectorCode": inspector_char,
                "judgeResult": judge_str,
                "dailySerial": daily_serial,
                "mtrVersion": "4.0",
                "eepromAddress": f"0x{eeprom_address:02X}",
                "offset": f"0x{offset:02X}"
            }

        except Exception as e:
            print(f"[ERROR] MTR 4.0 EEPROM 읽기 시도 {attempt + 1}/{max_retries} 실패 (주소: 0x{eeprom_address:02X}, 오프셋: 0x{offset:02X}): {e}")
            if i2c.configured:
                i2c.terminate()
            if attempt < max_retries - 1:
                time.sleep(0.1)
            else:
                return {"success": False, "error": f"EEPROM 읽기 실패: {e}"}