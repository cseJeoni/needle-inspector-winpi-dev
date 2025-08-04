import ctypes
import os

dll_path = r"C:\Windows\System32\DNX64.dll"

try:
    sdk = ctypes.WinDLL(dll_path)
    print("✅ DLL 로드 성공")
except OSError as e:
    print("❌ DLL 로드 실패:", e)
    import traceback
    traceback.print_exc()
