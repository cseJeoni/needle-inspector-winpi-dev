# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# DNX64 SDK 파일들을 데이터로 포함
datas = [
    ('pyDnx64v2/DNX64.dll', 'pyDnx64v2'),
    ('pyDnx64v2/dnx64.py', 'pyDnx64v2'),
]

hiddenimports = [
    'ctypes',
    'ctypes.wintypes',
    'json',
    'sys',
    'os',
    'argparse',
]

binaries = []

a = Analysis(
    ['camera_led_control.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'pandas',
        'scipy',
        'notebook',
        'IPython',
        'tkinter',
        'test',
        'setuptools',
        'distutils',
        'flask',
        'cv2',
        'opencv',
        'websockets',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='camera_led_control',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
