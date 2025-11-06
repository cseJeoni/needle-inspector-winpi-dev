# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# 숨겨진 import 목록
hiddenimports = [
    'flask',
    'flask_cors',
    'cv2',
    'websockets',
    'serial',
    'bcrypt',
    'numpy',
    'PIL',
    'PIL.Image',
    'PIL.ImageDraw',
    'PIL.ImageFont',
    'werkzeug',
    'werkzeug.security',
    'click',
    'itsdangerous',
    'jinja2',
    'markupsafe',
    'asyncio',
    'concurrent.futures',
    'threading',
    'queue',
    'serial.tools',
    'serial.tools.list_ports',
]

# 데이터 파일 (SDK 등)
datas = []

# 바이너리 (필요시 추가)
binaries = []

a = Analysis(
    ['camera_server.py'],
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
    name='camera_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # 디버깅을 위해 콘솔 창 유지
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
