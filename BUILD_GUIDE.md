# 🚀 Needle Inspector 빌드 가이드

## 📦 Python 번들링 시스템

이 프로젝트는 Python 스크립트를 실행 파일로 번들링하여 사용자가 Python을 설치하지 않아도 프로그램을 사용할 수 있도록 합니다.

### 🆕 카메라 선택 시스템
- 프로그램 시작 시 카메라 선택 UI가 표시됩니다
- 사용자가 카메라를 선택하면 `camera_server.exe` 또는 `camera_server.py`가 시작됩니다
- 카메라 인덱스는 `--camera1`, `--camera2` 인자로 전달됩니다

## 🛠 빌드 전 준비사항

### 1. Python 설치 (개발자용)
- Python 3.8 이상 필요
- pip 패키지 관리자 포함

### 2. 의존성 설치
```bash
cd backend
pip install -r requirements.txt
```

## 📋 빌드 프로세스

### 1단계: Python 실행 파일 빌드
```bash
npm run build:python
```

이 명령은 다음 작업을 수행합니다:
- 기존 dist 폴더 정리
- Python 의존성 설치
- PyInstaller로 camera_server.exe 생성
- pyDnx64v2 SDK 폴더 복사

### 2단계: 빌드 테스트
```bash
node scripts/test-build.js
```

### 3단계: Electron 앱 빌드
```bash
npm run build:win
```

## 📁 프로젝트 구조

```
needle-inspector-winpi-dev/
├── backend/
│   ├── camera_server.py            # 카메라 서버 소스
│   ├── camera_server_optimized.spec # PyInstaller 최적화 설정
│   ├── camera_led_control.py       # LED 제어 스크립트
│   ├── pyDnx64v2/                  # 카메라 SDK
│   ├── dist/                       # 빌드된 exe 파일
│   │   ├── camera_server.exe       # 번들링된 실행 파일
│   │   └── pyDnx64v2/              # SDK 복사본
│   └── requirements.txt            # Python 의존성
├── scripts/
│   ├── build-python.js             # Python 빌드 스크립트
│   └── test-build.js                # 빌드 테스트 스크립트
├── electron/
│   └── main.js                      # exe/python 자동 감지 로직
└── package.json                     # npm 스크립트 정의
```

## ⚙️ 동작 방식

### 개발 모드
1. `camera_server.py` Python 스크립트 직접 실행
2. Python 설치 필요
3. 빠른 수정 및 테스트 가능

### 프로덕션 모드
1. `camera_server.exe` 실행 파일 사용
2. Python 설치 불필요
3. 모든 의존성 포함된 단일 파일
4. 사용자 배포용

### 자동 감지 로직
`electron/main.js`의 `start-camera-server` IPC 핸들러가:
1. 먼저 `backend/dist/camera_server.exe` 확인
2. exe가 있으면 → exe 실행 (프로덕션)
3. exe가 없으면 → Python 스크립트 실행 (개발)
4. 카메라 인덱스를 `--camera1 X --camera2 Y` 형식으로 전달

## 🔧 문제 해결

### 빌드 실패 시
1. Python 버전 확인: `python --version`
2. 의존성 재설치: `pip install -r backend/requirements.txt`
3. dist 폴더 수동 삭제 후 재시도

### exe 실행 오류 시
1. Windows Defender/백신 예외 추가
2. 관리자 권한으로 실행
3. pyDnx64v2 폴더 존재 확인

### 카메라가 안 보일 때
1. 카메라 USB 연결 확인
2. 카메라 드라이버 설치 확인
3. VID 필터링 설정 확인 (0x04B4)

## 📝 빌드 스크립트 옵션

### build-python.js 수정 가능한 옵션:
```javascript
const scripts = [
  {
    name: 'camera_server.py',
    output: 'camera_server',
    additionalData: ['pyDnx64v2'],  // 포함할 폴더/파일
    hiddenImports: [                 // 숨겨진 import
      'cv2', 'flask', 'flask_cors', 
      'numpy', 'PIL'
    ],
    additionalPackages: [             // 전체 패키지 수집
      'cv2', 'numpy', 'flask'
    ]
  }
];
```

### spec 파일 최적화
`camera_server_optimized.spec` 파일로 더 세밀한 제어:
- 불필요한 패키지 제외
- 파일 크기 최적화
- 시작 속도 개선

## 🚢 배포 체크리스트

- [ ] Python 빌드 완료: `npm run build:python`
- [ ] 빌드 테스트 통과: `node scripts/test-build.js`
- [ ] camera_server.exe 존재 확인
- [ ] pyDnx64v2 폴더 복사 확인
- [ ] Electron 빌드: `npm run build:win`
- [ ] 설치 파일 테스트
- [ ] 카메라 인식 테스트
- [ ] LED 제어 테스트
- [ ] 관리자 패널 파일 변경 테스트

## 📞 지원

빌드 관련 문제 발생 시:
1. 이 문서의 문제 해결 섹션 확인
2. `scripts/test-build.js` 실행하여 상세 오류 확인
3. 콘솔 로그 확인 (Electron 개발자 도구)

---
마지막 업데이트: 2024년
