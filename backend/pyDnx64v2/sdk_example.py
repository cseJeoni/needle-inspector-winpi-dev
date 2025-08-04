from dnx64 import DNX64

# SDK 초기화
microscope = DNX64("DNX64.dll")
microscope.SetVideoDeviceIndex(0)

if microscope.Init():
    # 장치 정보 확인
    device_count = microscope.GetVideoDeviceCount()
    config = microscope.GetConfig(0)
    
    # 노출 설정
    microscope.SetAutoExposure(0, 1)  # 자동 노출 ON
    microscope.SetAETarget(0, 18)     # 타겟값 설정
    
    # LED 제어
    microscope.SetLEDState(0, 1)      # LED1 ON
    microscope.SetFLCLevel(0, 4)      # FLC 밝기 4단계