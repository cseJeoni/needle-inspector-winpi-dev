// scripts/check-backend.js
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('빌드 전 Backend 폴더 체크');
console.log('========================================');

const backendPath = path.join(__dirname, '..', 'backend');
const cameraServerPath = path.join(backendPath, 'camera_server.py');

// backend 폴더 존재 확인
if (!fs.existsSync(backendPath)) {
  console.error('❌ ERROR: backend 폴더가 없습니다!');
  console.error(`   경로: ${backendPath}`);
  process.exit(1);
}

console.log('✅ backend 폴더 존재');

// camera_server.py 확인
if (!fs.existsSync(cameraServerPath)) {
  console.error('❌ ERROR: camera_server.py 파일이 없습니다!');
  console.error(`   경로: ${cameraServerPath}`);
  process.exit(1);
}

console.log('✅ camera_server.py 존재');

// backend 폴더 내 파일 목록
const files = fs.readdirSync(backendPath);
console.log('\n📂 Backend 폴더 내용:');
files.forEach(file => {
  const filePath = path.join(backendPath, file);
  const stats = fs.statSync(filePath);
  const type = stats.isDirectory() ? '📁' : '📄';
  console.log(`   ${type} ${file}`);
});

console.log('\n✅ Backend 체크 완료! 빌드를 진행합니다...\n');
console.log('========================================\n');