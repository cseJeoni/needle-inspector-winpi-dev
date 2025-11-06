# -*- mode: python ; coding: utf-8 -*-

import os

block_cipher = None

hiddenimports = [
    'cv2',
    'json',
    'sys',
    'numpy',
    'ctypes',
    'dnx64',
]

# SDK 포함
spec_dir = os.path.dirname(os.path.abspath(SPEC))
sdk_path = os.path.join(spec_dir, 'pyDnx64v2')

datas = []
binaries = []

# SDK 전체 폴더를 포함
if os.path.exists(sdk_path):
    datas.append((sdk_path, 'pyDnx64v2'))

a = Analysis(
    ['camera_list.py'],
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
    name='camera_list',
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
