const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const DIST_DIR = path.join(BACKEND_DIR, 'dist');
const SERVER_SPEC_FILE = path.join(BACKEND_DIR, 'camera_server_optimized.spec');
const LIST_SPEC_FILE = path.join(BACKEND_DIR, 'camera_list_optimized.spec');
const LED_SPEC_FILE = path.join(BACKEND_DIR, 'camera_led_control_optimized.spec');

console.log('🚀 Python 번들링 빌드 시작...\n');

// 1단계: dist 폴더 정리
console.log('📁 [1/6] dist 폴더 정리 중...');
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  console.log('✓ dist 폴더 삭제 완료');
}
fs.mkdirSync(DIST_DIR, { recursive: true });
console.log('✓ dist 폴더 생성 완료\n');

// 2단계: Python 의존성 설치
console.log('📦 [2/6] Python 의존성 설치 중...');
try {
  execSync('pip install -r requirements.txt', {
    cwd: BACKEND_DIR,
    stdio: 'inherit'
  });
  console.log('✓ 의존성 설치 완료\n');
} catch (error) {
  console.error('❌ 의존성 설치 실패:', error.message);
  process.exit(1);
}

// 3단계: camera_server.exe 빌드
console.log('🔨 [3/6] camera_server.exe 빌드 중...');
console.log(`   Spec 파일: ${SERVER_SPEC_FILE}`);

if (!fs.existsSync(SERVER_SPEC_FILE)) {
  console.error(`❌ Spec 파일을 찾을 수 없습니다: ${SERVER_SPEC_FILE}`);
  process.exit(1);
}

try {
  execSync(`pyinstaller ${SERVER_SPEC_FILE} --clean --noconfirm`, {
    cwd: BACKEND_DIR,
    stdio: 'inherit'
  });
  console.log('✓ camera_server.exe 빌드 완료\n');
} catch (error) {
  console.error('❌ camera_server.exe 빌드 실패:', error.message);
  process.exit(1);
}

// 4단계: camera_list.exe 빌드
console.log('🔨 [4/6] camera_list.exe 빌드 중...');
console.log(`   Spec 파일: ${LIST_SPEC_FILE}`);

if (!fs.existsSync(LIST_SPEC_FILE)) {
  console.error(`❌ Spec 파일을 찾을 수 없습니다: ${LIST_SPEC_FILE}`);
  process.exit(1);
}

try {
  execSync(`pyinstaller ${LIST_SPEC_FILE} --clean --noconfirm`, {
    cwd: BACKEND_DIR,
    stdio: 'inherit'
  });
  console.log('✓ camera_list.exe 빌드 완료\n');
} catch (error) {
  console.error('❌ camera_list.exe 빌드 실패:', error.message);
  process.exit(1);
}

// 5단계: camera_led_control.exe 빌드
console.log('🔨 [5/6] camera_led_control.exe 빌드 중...');
console.log(`   Spec 파일: ${LED_SPEC_FILE}`);

if (!fs.existsSync(LED_SPEC_FILE)) {
  console.error(`❌ Spec 파일을 찾을 수 없습니다: ${LED_SPEC_FILE}`);
  process.exit(1);
}

try {
  execSync(`pyinstaller ${LED_SPEC_FILE} --clean --noconfirm`, {
    cwd: BACKEND_DIR,
    stdio: 'inherit'
  });
  console.log('✓ camera_led_control.exe 빌드 완료\n');
} catch (error) {
  console.error('❌ camera_led_control.exe 빌드 실패:', error.message);
  process.exit(1);
}

// 6단계: pyDnx64v2 SDK 폴더 복사
console.log('📋 [6/6] pyDnx64v2 SDK 복사 중...');
const sdkSource = path.join(BACKEND_DIR, 'pyDnx64v2');
const sdkDest = path.join(DIST_DIR, 'pyDnx64v2');

if (fs.existsSync(sdkSource)) {
  fs.cpSync(sdkSource, sdkDest, { recursive: true });
  console.log('✓ SDK 복사 완료\n');
} else {
  console.warn('⚠ pyDnx64v2 폴더를 찾을 수 없습니다. (선택사항)\n');
}

// 빌드 결과 확인
console.log('📊 빌드 결과 확인:');
const serverExePath = path.join(DIST_DIR, 'camera_server.exe');
const listExePath = path.join(DIST_DIR, 'camera_list.exe');
const ledExePath = path.join(DIST_DIR, 'camera_led_control.exe');

if (fs.existsSync(serverExePath)) {
  const stats = fs.statSync(serverExePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   ✓ camera_server.exe: ${sizeMB} MB`);
} else {
  console.error('   ❌ camera_server.exe 생성 실패');
  process.exit(1);
}

if (fs.existsSync(listExePath)) {
  const stats = fs.statSync(listExePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   ✓ camera_list.exe: ${sizeMB} MB`);
} else {
  console.error('   ❌ camera_list.exe 생성 실패');
  process.exit(1);
}

if (fs.existsSync(ledExePath)) {
  const stats = fs.statSync(ledExePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`   ✓ camera_led_control.exe: ${sizeMB} MB`);
} else {
  console.error('   ❌ camera_led_control.exe 생성 실패');
  process.exit(1);
}

if (fs.existsSync(sdkDest)) {
  const files = fs.readdirSync(sdkDest);
  console.log(`   ✓ pyDnx64v2/: ${files.length}개 파일`);
}

console.log('\n✨ Python 번들링 빌드 완료!');
console.log('📦 출력 경로:', DIST_DIR);
console.log('\n다음 단계:');
console.log('  1. node scripts/test-build.js  # 빌드 테스트');
console.log('  2. npm run build:win           # Electron 앱 빌드');
