/* eslint-disable no-undef */

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const Store = require("electron-store");

let win = null;
let serverProcess = null;
let serverStarted = false;
let serverUrl = "ws://localhost:8765";

// electron-store 초기화
const store = new Store({
  name: 'needle-inspector-config',
  defaults: {
    cameraLines: {
      camera1: {
        lines: [],
        calibrationValue: 19.8,
        selectedLineColor: 'red'
      },
      camera2: {
        lines: [],
        calibrationValue: 19.8,
        selectedLineColor: 'red'
      }
    }
  }
});

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

/**
 * CSV 파일을 파싱하여 객체 배열로 변환
 * @param {string} filePath - CSV 파일 경로
 * @returns {Array} 파싱된 데이터 배열
 */
function parseCSV(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`CSV 파일이 존재하지 않습니다: ${filePath}`);
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        rows.push(row);
      }
    }

    return rows;
  } catch (error) {
    console.error(`CSV 파일 파싱 오류 (${filePath}):`, error);
    return [];
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

// IPC 핸들러 등록
ipcMain.handle('load-csv-data', async (event, configDir = 'C:\\inspector_config_data') => {
  try {
    const mtr2Path = path.join(configDir, 'mtr_2.csv');
    const mtr4Path = path.join(configDir, 'mtr_4.csv');
    
    console.log(`[INFO] CSV 파일 읽기 시도:`);
    console.log(`  - MTR 2.0: ${mtr2Path}`);
    console.log(`  - MTR 4.0: ${mtr4Path}`);
    
    const mtr2Data = parseCSV(mtr2Path);
    const mtr4Data = parseCSV(mtr4Path);
    
    console.log(`[INFO] CSV 데이터 로드 완료:`);
    console.log(`  - MTR 2.0: ${mtr2Data.length}개 레코드`);
    console.log(`  - MTR 4.0: ${mtr4Data.length}개 레코드`);
    
    return {
      mtr2: mtr2Data,
      mtr4: mtr4Data
    };
  } catch (error) {
    console.error('[ERROR] CSV 데이터 로드 실패:', error);
    return {
      mtr2: [],
      mtr4: []
    };
  }
});

// 파일 저장 IPC 핸들러
ipcMain.handle('save-file', async (event, filePath, data) => {
  try {
    // Base64 데이터를 Buffer로 변환
    const base64Data = data.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    await fs.promises.writeFile(filePath, buffer);
    console.log(`✅ 파일 저장 완료: ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error('❌ 파일 저장 실패:', error);
    return { success: false, error: error.message };
  }
});

// 디렉토리 생성 IPC 핸들러
ipcMain.handle('ensure-dir', async (event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      await fs.promises.mkdir(dirPath, { recursive: true });
      console.log(`📁 폴더 생성 완료: ${dirPath}`);
    }
    return { success: true };
  } catch (error) {
    console.error('❌ 폴더 생성 실패:', error);
    return { success: false, error: error.message };
  }
});

// 사용자 CSV 파일 로드 IPC 핸들러
ipcMain.handle('load-users-csv', async (event) => {
  try {
    const configDir = 'C:\\inspector_config_data';
    const usersPath = path.join(configDir, 'users.csv');
    
    // 디렉토리가 없으면 생성
    if (!fs.existsSync(configDir)) {
      await fs.promises.mkdir(configDir, { recursive: true });
      console.log(`[INFO] 설정 디렉토리 생성: ${configDir}`);
    }
    
    // CSV 파일이 없으면 기본 사용자 생성
    if (!fs.existsSync(usersPath)) {
      console.log('[INFO] users.csv 파일이 없습니다. 기본 파일을 생성합니다.');
      const defaultCSV = 'id,pw\nadmin,admin123';
      await fs.promises.writeFile(usersPath, defaultCSV, 'utf8');
      console.log('[INFO] 기본 관리자 계정 생성: admin/admin123');
    }
    
    // CSV 파일 읽기
    const csvContent = await fs.promises.readFile(usersPath, 'utf8');
    const lines = csvContent.split('\n');
    
    const users = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const values = line.split(',').map(v => v.trim());
        if (values.length >= 3) {
          const id = values[0];
          const pw = values[1];
          const birth = values[2];
          users[id] = { pw: pw, birth: birth };
        } else if (values.length >= 2) {
          // 기존 호환성 유지 (birth 없는 경우)
          const id = values[0];
          const pw = values[1];
          users[id] = { pw: pw, birth: '' };
        }
      }
    }
    
    console.log(`[OK] 사용자 정보 로드 완료: ${Object.keys(users).length}명`);
    return { success: true, users: users };
    
  } catch (error) {
    console.error('[ERROR] 사용자 정보 로드 실패:', error);
    return { success: false, error: error.message, users: {} };
  }
});

// 파일 선택 다이얼로그 IPC 핸들러
ipcMain.handle('select-file', async (event, options = {}) => {
  try {
    const result = await dialog.showOpenDialog(win, {
      title: '파일 선택',
      properties: ['openFile'],
      filters: [
        { name: 'CSV 파일', extensions: ['csv'] },
        { name: '모든 파일', extensions: ['*'] }
      ],
      ...options
    });
    
    console.log(`[INFO] 파일 선택 결과:`, result);
    return result;
  } catch (error) {
    console.error('[ERROR] 파일 선택 실패:', error);
    return { canceled: true, filePaths: [] };
  }
});

// 폴더 선택 다이얼로그 IPC 핸들러
ipcMain.handle('select-folder', async (event, options = {}) => {
  try {
    const result = await dialog.showOpenDialog(win, {
      title: '폴더 선택',
      properties: ['openDirectory'],
      ...options
    });
    
    console.log(`[INFO] 폴더 선택 결과:`, result);
    return result;
  } catch (error) {
    console.error('[ERROR] 폴더 선택 실패:', error);
    return { canceled: true, filePaths: [] };
  }
});

// 카메라 선 정보 저장 IPC 핸들러
ipcMain.handle('save-camera-lines', async (event, cameraId, linesData) => {
  try {
    console.log(`[INFO] 카메라 ${cameraId} 선 정보 저장:`, linesData);
    
    const cameraKey = `camera${cameraId}`;
    const currentData = store.get('cameraLines', {});
    
    currentData[cameraKey] = {
      ...currentData[cameraKey],
      ...linesData
    };
    
    store.set('cameraLines', currentData);
    console.log(`[SUCCESS] 카메라 ${cameraId} 선 정보 저장 완료`);
    
    return { success: true };
  } catch (error) {
    console.error(`[ERROR] 카메라 ${cameraId} 선 정보 저장 실패:`, error);
    return { success: false, error: error.message };
  }
});

// 카메라 선 정보 로드 IPC 핸들러
ipcMain.handle('load-camera-lines', async (event, cameraId) => {
  try {
    const cameraKey = `camera${cameraId}`;
    const cameraLines = store.get('cameraLines', {});
    const cameraData = cameraLines[cameraKey] || {
      lines: [],
      calibrationValue: 19.8,
      selectedLineColor: 'red'
    };
    
    console.log(`[INFO] 카메라 ${cameraId} 선 정보 로드:`, cameraData);
    return { success: true, data: cameraData };
  } catch (error) {
    console.error(`[ERROR] 카메라 ${cameraId} 선 정보 로드 실패:`, error);
    return { 
      success: false, 
      error: error.message,
      data: {
        lines: [],
        calibrationValue: 19.8,
        selectedLineColor: 'red'
      }
    };
  }
});

// 모든 카메라 선 정보 로드 IPC 핸들러
ipcMain.handle('load-all-camera-lines', async (event) => {
  try {
    const allCameraLines = store.get('cameraLines', {});
    console.log('[INFO] 모든 카메라 선 정보 로드:', allCameraLines);
    return { success: true, data: allCameraLines };
  } catch (error) {
    console.error('[ERROR] 모든 카메라 선 정보 로드 실패:', error);
    return { 
      success: false, 
      error: error.message,
      data: {
        camera1: { lines: [], calibrationValue: 19.8, selectedLineColor: 'red' },
        camera2: { lines: [], calibrationValue: 19.8, selectedLineColor: 'red' }
      }
    };
  }
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

async function createWindow() {
  try {
    // 백엔드 서버 시작
    startBackendServer();
    
    // 서버가 시작될 때까지 대기
    await waitForBackend();
    
    // 웹소켓 서버가 실행된 후 창 생성
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
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
      console.log(`[DEBUG] 현재 플랫폼: ${process.platform}`);
      console.log(`[DEBUG] 서버 프로세스 PID: ${serverProcess.pid}`);
      
      try {
        // Windows에서는 프로세스 트리 전체 종료 (더 확실한 조건 검사)
        const isWindows = process.platform === 'win32' || process.platform.startsWith('win') || process.env.OS === 'Windows_NT';
        
        if (isWindows) {
          console.log('[INFO] Windows 환경 - taskkill 사용');
          const { spawn } = require('child_process');
          const killProcess = spawn('taskkill', ['/pid', serverProcess.pid, '/T', '/F'], { stdio: 'ignore' });
          
          killProcess.on('close', (code) => {
            console.log(`[INFO] taskkill 완료 (코드: ${code})`);
          });
          
          killProcess.on('error', (error) => {
            console.error('[ERROR] taskkill 실패:', error);
            // taskkill 실패 시 fallback으로 SIGTERM 사용
            serverProcess.kill('SIGTERM');
          });
        } else {
          console.log('[INFO] Unix 환경 - SIGTERM 사용');
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

app.on('quit', () => {
  console.log('[INFO] Electron 앱 종료');
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/* eslint-enable no-undef */
