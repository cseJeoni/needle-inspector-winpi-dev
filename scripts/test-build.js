const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_DIR = path.join(__dirname, '..', 'backend');
const DIST_DIR = path.join(BACKEND_DIR, 'dist');
const EXE_PATH = path.join(DIST_DIR, 'camera_server.exe');

console.log('🧪 Python 빌드 테스트 시작...\n');

// 1. exe 파일 존재 확인
console.log('📁 [1/3] 파일 존재 확인...');
if (!fs.existsSync(EXE_PATH)) {
  console.error(`❌ camera_server.exe를 찾을 수 없습니다: ${EXE_PATH}`);
  console.error('\n먼저 빌드를 실행하세요: npm run build:python');
  process.exit(1);
}

const stats = fs.statSync(EXE_PATH);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
console.log(`✓ camera_server.exe: ${sizeMB} MB`);

// SDK 폴더 확인
const sdkPath = path.join(DIST_DIR, 'pyDnx64v2');
if (fs.existsSync(sdkPath)) {
  const files = fs.readdirSync(sdkPath);
  console.log(`✓ pyDnx64v2/: ${files.length}개 파일\n`);
} else {
  console.log('⚠ pyDnx64v2/ 폴더 없음 (선택사항)\n');
}

// 2. exe 실행 테스트
console.log('🚀 [2/3] exe 실행 테스트...');
console.log('   --help 옵션으로 실행 중...');

const testProcess = spawn(EXE_PATH, ['--help'], {
  cwd: DIST_DIR,
  env: process.env
});

let output = '';
let errorOutput = '';

testProcess.stdout.on('data', (data) => {
  output += data.toString();
});

testProcess.stderr.on('data', (data) => {
  errorOutput += data.toString();
});

testProcess.on('close', (code) => {
  console.log(`\n   종료 코드: ${code}`);
  
  if (output) {
    console.log('\n   📤 출력:');
    console.log(output.split('\n').map(line => `      ${line}`).join('\n'));
  }
  
  if (errorOutput && !errorOutput.includes('VIDEOIO')) {
    console.log('\n   ⚠ 경고/오류:');
    console.log(errorOutput.split('\n').map(line => `      ${line}`).join('\n'));
  }
  
  // 3. 결과 평가
  console.log('\n📊 [3/3] 테스트 결과:');
  
  if (code === 0 || output.includes('usage:') || output.includes('camera_server')) {
    console.log('   ✓ exe 실행 성공');
    console.log('   ✓ Python 의존성 정상 번들링');
    console.log('\n✨ 빌드 테스트 성공!');
    console.log('\n다음 단계: npm run build:win  # Electron 앱 빌드');
  } else {
    console.error('   ❌ exe 실행 실패');
    console.error('\n디버깅 팁:');
    console.error('  1. 필요한 DLL이 누락되었을 수 있습니다');
    console.error('  2. spec 파일의 hiddenimports 확인');
    console.error('  3. 콘솔 창에서 직접 실행: ' + EXE_PATH);
    process.exit(1);
  }
});

testProcess.on('error', (error) => {
  console.error(`\n❌ 프로세스 실행 오류: ${error.message}`);
  process.exit(1);
});

// 타임아웃 설정 (5초)
setTimeout(() => {
  testProcess.kill();
}, 5000);
