"""
DirectShow를 통해 카메라 이름 확인
"""
import cv2
import subprocess
import json

def get_camera_name_directshow(index):
    """DirectShow를 통해 카메라 이름 가져오기"""
    try:
        # PowerShell 명령어로 DirectShow 장치 목록 가져오기
        cmd = """
        Add-Type -TypeDefinition @"
        using System;
        using System.Collections.Generic;
        using System.Runtime.InteropServices;
        using System.Runtime.InteropServices.ComTypes;
        
        public class DirectShowDevices {
            [DllImport("ole32.dll")]
            static extern int CoCreateInstance(ref Guid clsid, IntPtr pUnkOuter, uint dwClsContext, ref Guid iid, out IntPtr ppv);
            
            public static List<string> GetVideoDevices() {
                var devices = new List<string>();
                // 간단히 WMI 사용
                var searcher = new System.Management.ManagementObjectSearcher("SELECT * FROM Win32_PnPEntity WHERE PNPClass = 'Camera' OR PNPClass = 'Image'");
                foreach(var device in searcher.Get()) {
                    var name = device["Name"]?.ToString();
                    if (!string.IsNullOrEmpty(name))
                        devices.Add(name);
                }
                return devices;
            }
        }
        "@
        [DirectShowDevices]::GetVideoDevices() | ConvertTo-Json
        """
        
        # WMI를 사용한 더 간단한 방법
        cmd = [
            'powershell', '-Command',
            "Get-WmiObject Win32_PnPEntity | Where-Object {$_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image'} | Select-Object -ExpandProperty Name"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
        if result.returncode == 0 and result.stdout:
            devices = [line.strip() for line in result.stdout.split('\n') if line.strip()]
            return devices
        return []
    except:
        return []

def test_all_cameras():
    """모든 카메라 테스트"""
    print("=== 모든 카메라 테스트 ===\n")
    
    # DirectShow 장치 목록
    ds_devices = get_camera_name_directshow(0)
    print("DirectShow 장치 목록:")
    for i, dev in enumerate(ds_devices):
        print(f"  {i}: {dev}")
    print()
    
    # OpenCV로 각 인덱스 테스트
    print("OpenCV 카메라 테스트:")
    for index in range(10):
        try:
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
            if cap.isOpened():
                # 속성 가져오기
                width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                
                # 프레임 읽기
                ret, frame = cap.read()
                
                # Backend 이름 확인 (가능한 경우)
                backend = cap.getBackendName()
                
                print(f"  인덱스 {index}: {width}x{height} - Backend: {backend}")
                
                # Dino 카메라 특성 체크
                is_dino = False
                if ret and frame is not None:
                    # Dino 카메라는 보통 특정 밝기 범위를 가짐
                    mean_brightness = frame.mean()
                    if 50 < mean_brightness < 100 and width == 640 and height == 480:
                        is_dino = True
                    
                    print(f"    평균 밝기: {mean_brightness:.1f} - {'Dino 가능성' if is_dino else '일반 카메라'}")
                
                cap.release()
            else:
                print(f"  인덱스 {index}: 열리지 않음")
        except Exception as e:
            print(f"  인덱스 {index}: 오류 - {e}")

if __name__ == '__main__':
    test_all_cameras()
