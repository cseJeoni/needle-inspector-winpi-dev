def generate_servo_mode_command(target_position, motor_id=0x01):
    return _generate_mode_command(mode_code=0x01, speed=0, position=target_position, force=0, motor_id=motor_id)

def generate_position_mode_command(target_position, motor_id=0x01):
    return _generate_mode_command(mode_code=0x00, speed=0, position=target_position, force=0, motor_id=motor_id)

def generate_speed_mode_command(target_speed, target_position, motor_id=0x01):
    # 스피드 모드 명령어: 3개 레지스터 동시 설정
    # Register 0x25 (Control Mode) = 0x02 (스피드 모드)
    # Register 0x28 (Target Speed) = target_speed
    # Register 0x29 (Target Position) = target_position
    header = [0x55, 0xAA]
    frame_length = 0x0D  # 13바이트 데이터
    command_type = 0x32
    
    # Register 0x25: Control Mode = 0x02 (스피드 모드)
    control_mode_register = [0x25, 0x00]
    control_mode_data = [0x02, 0x00]
    
    # Motor Output Voltage Register (사용하지 않음)
    voltage_register = [0x00, 0x00]
    voltage_data = [0x00, 0x00]
    
    # Register 0x28: Target Speed
    speed_data = [target_speed & 0xFF, (target_speed >> 8) & 0xFF]
    
    # Register 0x29: Target Position  
    position_data = [target_position & 0xFF, (target_position >> 8) & 0xFF]
    
    payload = control_mode_register + control_mode_data + voltage_register + voltage_data + speed_data + position_data
    checksum = (frame_length + motor_id + command_type + sum(payload)) & 0xFF
    
    return bytes(header + [frame_length, motor_id, command_type] + payload + [checksum])

def generate_speed_force_mode_command(target_force, target_speed, target_position, motor_id=0x01):
    return _generate_mode_command(mode_code=0x05, speed=target_speed, position=target_position, force=target_force, motor_id=motor_id)

def generate_status_read_command(motor_id=0x01):
    # 상태 읽기 명령어: 55 AA 01 [ID] 30 [Checksum]
    header = [0x55, 0xAA]
    frame_length = 0x01
    command_type = 0x30
    
    checksum = (frame_length + motor_id + command_type) & 0xFF
    
    return bytes(header + [frame_length, motor_id, command_type, checksum])

def generate_force_mode_command(target_force, motor_id=0x01):
    # target_force는 g 단위 (예: 1000g = 0x03E8)
    header = [0x55, 0xAA]
    frame_length = 0x09
    command_type = 0x32

    control_mode_register = [0x25, 0x00]
    control_mode_setting = [0x03, 0x00]  # 0x03: force mode
    not_used = [0x00, 0x00]
    force_data = [target_force & 0xFF, (target_force >> 8) & 0xFF]

    payload = control_mode_register + control_mode_setting + not_used + force_data
    checksum = (frame_length + motor_id + command_type + sum(payload)) & 0xFF

    return bytes(header + [frame_length, motor_id, command_type] + payload + [checksum])

def _generate_mode_command(mode_code, speed, position, force, frame_length=0x0D, motor_id=0x01):
    header = [0x55, 0xAA]
    command_type = 0x32

    control_mode_register = [0x25, 0x00]
    control_mode_setting = [mode_code, 0x00]
    not_used = [0x00, 0x00]

    force_data = [force & 0xFF, (force >> 8) & 0xFF]
    speed_data = [speed & 0xFF, (speed >> 8) & 0xFF]
    position_data = [position & 0xFF, (position >> 8) & 0xFF]

    payload = (
        control_mode_register + control_mode_setting + not_used +
        force_data + speed_data + position_data
    )

    checksum = (frame_length + motor_id + command_type + sum(payload)) & 0xFF

    return bytes(header + [frame_length, motor_id, command_type] + payload + [checksum])
