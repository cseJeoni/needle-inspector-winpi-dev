/* eslint-disable no-undef */

const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

let win = null;
let serverProcess = null;
let serverStarted = false;
let serverUrl = "ws://localhost:8765";

// 개발 모드에서만 electron-reload 사용
if (process.env.NODE_ENV !== 'production') {
  require("electron-reload")(__dirname);
}

// 앱 기본 리소스 경로 설정
function getBackendPath() {
  // 개발 환경과 프로덕션 환경의 경로가 다름
  if (process.env.NODE_ENV !== 'production') {
    return path.join(__dirname, '..', 'backend');
  } else {
    // 프로덕션에서는 electron-builder의 extraResources 설정에 따라 경로가 달라짐
    return path.join(process.resourcesPath, 'backend');
  }
}

// 파이썬 서버 시작
function startBackendServer() {
  const backendPath = getBackendPath();
  const serverScriptPath = path.join(backendPath, 'camera_server.py');

  console.log(`[INFO] 카메라 서버 시작 시도: ${serverScriptPath}`);
  
  if (!fs.existsSync(serverScriptPath)) {
    console.error(`[ERROR] 서버 스크립트를 찾을 수 없음: ${serverScriptPath}`);
    dialog.showErrorBox('서버 오류', `서버 스크립트를 찾을 수 없습니다: ${serverScriptPath}`);
    app.exit(1);
    return null;
  }

  const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
  serverProcess = spawn(pythonExecutable, [serverScriptPath]);

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    console.log(`[PY-OUT] ${output}`);
    
    // Flask 서버 시작 메시지들을 감지
    if (output.includes('Running on http://') || 
        output.includes('* Running on') || 
        output.includes('Flask app') ||
        output.includes('Debug mode: on')) {
      console.log(`[INFO] Flask 서버 시작 감지됨 (stdout): ${output}`);
      serverStarted = true;
      if (win) {
        win.webContents.send('backend-ready');
      }
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    console.error(`[PY-ERR] ${output}`);
    
    // Flask 서버 시작 메시지들을 stderr에서도 감지
    if (output.includes('Running on http://') || 
        output.includes('* Running on') || 
        output.includes('Flask app') ||
        output.includes('Debug mode: on')) {
      console.log(`[INFO] Flask 서버 시작 감지됨 (stderr): ${output}`);
      serverStarted = true;
      if (win) {
        win.webContents.send('backend-ready');
      }
    }
  });

  serverProcess.on('close', (code) => {
    console.log(`[INFO] 카메라 서버 종료됨 (코드: ${code})`);
    serverStarted = false;
    serverProcess = null;
  });

  return serverProcess;
}

// 백엔드 서버 상태 확인 및 연결 시도
function waitForBackend() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Backend start timeout'));
    }, 30000); // 타임아웃 시간을 30초로 늘림

    const checkInterval = setInterval(() => {
      if (serverStarted) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve();
      }
    }, 500);
  });
}

async function createWindow() {
  try {
    // 백엔드 서버 시작
    startBackendServer();
    
    // 서버가 시작될 때까지 대기
    await waitForBackend();
    
    // 웹소켓 서버가 실행된 후 창 생성
    win = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    // 운영 환경에서는 빌드된 정적 파일을 로드
    // 개발 환경에서는 개발 서버에서 로드
    if (process.env.NODE_ENV !== 'production') {
      win.loadURL("http://localhost:5173");
      win.webContents.openDevTools();
    } else {
      // 애플리케이션이 패키징될 때 경로가 달라질 수 있음
      // app.getAppPath()를 사용하여 앱의 실제 위치를 확인
      const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
      console.log(`[INFO] 로드할 HTML 파일 경로: ${indexPath}`);
      
      // 파일 존재 여부 확인
      if (fs.existsSync(indexPath)) {
        win.loadFile(indexPath);
      } else {
        console.error(`[ERROR] HTML 파일을 찾을 수 없음: ${indexPath}`);
        dialog.showErrorBox('오류', `앱 HTML 파일을 찾을 수 없습니다: ${indexPath}`);
      }
    }
    
    win.on('closed', () => {
      win = null;
    });
  } catch (err) {
    console.error('앱 시작 오류:', err);
    dialog.showErrorBox('오류', `앱 시작 중 오류가 발생했습니다: ${err.message}`);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 백엔드 서버 종료
    if (serverProcess) {
      console.log('[INFO] 카메라 서버 종료 중...');
      
      try {
        // Windows에서는 프로세스 트리 전체 종료
        if (process.platform === 'win32') {
          const { spawn } = require('child_process');
          spawn('taskkill', ['/pid', serverProcess.pid, '/T', '/F'], { stdio: 'ignore' });
        } else {
          // Linux/Mac에서는 SIGTERM 후 SIGKILL
          serverProcess.kill('SIGTERM');
          setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
              console.log('[WARN] 카메라 서버 강제 종료');
              serverProcess.kill('SIGKILL');
            }
          }, 1000); // 1초로 단축
        }
      } catch (error) {
        console.error('[ERROR] 서버 종료 중 오류:', error);
      }
      
      serverProcess = null;
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/* eslint-enable no-undef */
