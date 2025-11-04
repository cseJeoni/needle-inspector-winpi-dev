/* eslint-disable no-undef */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const execFileAsync = promisify(execFile);
const axios = require('axios');
const Store = require('electron-store');
const XLSX = require('xlsx');

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
if (!app.isPackaged) {
  try {
    require("electron-reload")(__dirname);
  } catch (e) {
    console.log('[INFO] electron-reload 없음 (정상)');
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling
// electron-squirrel-startup이 없어도 작동하도록 수정
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  // electron-squirrel-startup이 없으면 무시 (프로덕션 빌드)
  console.log('[INFO] electron-squirrel-startup 없음 (정상)');
}

// 앱 기본 리소스 경로 설정
function getBackendPath() {
  if (app.isPackaged) {
    // 패키징된 앱: resources 폴더 사용
    return path.join(process.resourcesPath, 'backend');
  } else {
    // 개발 모드: 상대 경로 사용
    return path.join(__dirname, '..', 'backend');
  }
}

// Python 실행 파일 확인
async function checkPythonAvailability() {
  const pythonCommands = ['python', 'python3', 'py'];
  
  for (const cmd of pythonCommands) {
    try {
      const { stdout } = await exec(`${cmd} --version`);
      console.log(`[INFO] Python 발견: ${stdout.trim()}`);
      return cmd;
    } catch (error) {
      // 다음 명령어 시도
    }
  }
  
  return null;
}

/**
 * 파일을 파싱하여 객체 배열로 변환 (CSV, XLSX, TXT 지원)
 */
function parseDataFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`파일이 존재하지 않습니다: ${filePath}`);
      return [];
    }

    const ext = path.extname(filePath).toLowerCase();
    console.log(`[INFO] 파일 파싱 시작: ${filePath} (확장자: ${ext})`);

    switch (ext) {
      case '.csv':
        return parseCSVContent(filePath);
      case '.xlsx':
      case '.xls':
        return parseXLSXContent(filePath);
      case '.txt':
        return parseTextContent(filePath);
      default:
        console.warn(`지원하지 않는 파일 형식: ${ext}`);
        return [];
    }
  } catch (error) {
    console.error(`파일 파싱 오류 (${filePath}):`, error);
    return [];
  }
}

function parseCSVContent(filePath) {
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
}

function parseXLSXContent(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);
  
  console.log(`[INFO] XLSX 파일 파싱 완료: ${jsonData.length}개 레코드`);
  return jsonData;
}

function parseTextContent(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length < 2) return [];
  
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  console.log(`[INFO] 텍스트 파일 구분자 감지: ${delimiter === '\t' ? 'TAB' : 'COMMA'}`);
  
  const headers = lines[0].split(delimiter).map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map(v => v.trim());
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return rows;
}

function parseCSV(filePath) {
  console.warn('[DEPRECATED] parseCSV 함수는 deprecated입니다. parseDataFile을 사용하세요.');
  return parseCSVContent(filePath);
}

// 파이썬 서버 시작
async function startBackendServer() {
  const backendPath = getBackendPath();
  const serverScriptPath = path.join(backendPath, 'camera_server.py');

  console.log(`[INFO] ========== 카메라 서버 시작 ==========`);
  console.log(`[INFO] Backend 경로: ${backendPath}`);
  console.log(`[INFO] 서버 스크립트: ${serverScriptPath}`);
  
  if (!fs.existsSync(serverScriptPath)) {
    console.error(`[ERROR] 서버 스크립트를 찾을 수 없음: ${serverScriptPath}`);
    dialog.showErrorBox('서버 오류', `서버 스크립트를 찾을 수 없습니다:\n${serverScriptPath}`);
    return null;
  }

  const pythonCmd = await checkPythonAvailability();
  if (!pythonCmd) {
    console.error('[ERROR] Python을 찾을 수 없습니다.');
    dialog.showErrorBox('Python 오류', 'Python이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.');
    return null;
  }

  console.log(`[INFO] Python 명령어: ${pythonCmd}`);
  console.log(`[INFO] 서버 프로세스 시작 중...`);

  try {
    serverProcess = spawn(pythonCmd, [serverScriptPath], {
      cwd: backendPath,
      env: process.env
    });

    console.log(`[INFO] 서버 프로세스 PID: ${serverProcess.pid}`);

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[FLASK] ${output}`);
      
      // Flask 서버 시작 메시지 감지
      if (output.includes('카메라 서버 시작') || 
          output.includes('Flask app')) {
        console.log(`[✓] Flask 앱 초기화 시작!`);
      }
      
      // Flask 서버가 실제로 listening 시작
      if (output.includes('Running on http://') || 
          output.includes('* Running on')) {
        console.log(`[✓✓✓] Flask 서버 LISTENING 시작!`);
        serverStarted = true;
        if (win) {
          win.webContents.send('backend-ready');
        }
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      
      // OpenCV 경고는 덜 중요하므로 [DEBUG]로 표시
      if (output.includes('VIDEOIO') || output.includes('WARN:')) {
        console.log(`[DEBUG] ${output}`);
      } else {
        console.log(`[FLASK-ERR] ${output}`);
      }
      
      // Flask 서버 시작 메시지를 stderr에서도 감지
      if (output.includes('Running on http://') || 
          output.includes('* Running on')) {
        console.log(`[✓✓✓] Flask 서버 LISTENING 시작 (stderr)!`);
        serverStarted = true;
        if (win) {
          win.webContents.send('backend-ready');
        }
      }
    });

    serverProcess.on('error', (error) => {
      console.error(`[ERROR] 카메라 서버 실행 오류:`, error);
      dialog.showErrorBox('서버 실행 오류', `카메라 서버를 시작할 수 없습니다:\n${error.message}`);
    });

    serverProcess.on('close', (code) => {
      console.log(`[INFO] 카메라 서버 종료됨 (코드: ${code})`);
      serverStarted = false;
      serverProcess = null;
    });

    return serverProcess;
  } catch (error) {
    console.error(`[ERROR] 서버 시작 오류:`, error);
    dialog.showErrorBox('서버 오류', `카메라 서버를 시작하는 중 오류가 발생했습니다:\n${error.message}`);
    return null;
  }
}

// 백엔드 서버가 준비될 때까지 대기
async function waitForBackend(maxWaitTime = 30000) {
  console.log('[INFO] 백엔드 서버 준비 대기 중...');
  console.log('[INFO] 카메라 초기화에 시간이 걸릴 수 있습니다 (최대 30초)');
  const startTime = Date.now();
  let lastLogTime = startTime;
  
  while (Date.now() - startTime < maxWaitTime) {
    if (serverStarted) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`[✓] 백엔드 서버 준비 완료! (${elapsed}초 소요)`);
      // 추가로 1초 더 대기 (안정화)
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }
    
    // 3초마다 로그 출력
    const now = Date.now();
    if (now - lastLogTime > 3000) {
      const elapsed = Math.round((now - startTime) / 1000);
      console.log(`[WAIT] 대기 중... (${elapsed}초 경과) - 카메라 초기화 진행 중...`);
      lastLogTime = now;
    }
    
    // 100ms마다 확인
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.error('[ERROR] 백엔드 서버 대기 시간 초과 (30초)');
  console.error('[ERROR] 카메라 초기화에 실패했을 수 있습니다.');
  return false;
}

// IPC 핸들러 등록
function registerIpcHandlers() {
  ipcMain.handle('save-file', async (event, filePath, data) => {
    try {
      // 디렉토리 생성
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Base64 이미지 데이터인 경우 (data:image/png;base64,... 형식)
      if (typeof data === 'string' && data.startsWith('data:image')) {
        const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
        console.log(`[OK] 이미지 저장 완료: ${filePath} (${buffer.length} bytes)`);
      } 
      // 일반 텍스트 데이터
      else if (typeof data === 'string') {
        fs.writeFileSync(filePath, data, 'utf-8');
        console.log(`[OK] 텍스트 파일 저장 완료: ${filePath}`);
      }
      // Buffer 데이터
      else {
        fs.writeFileSync(filePath, data);
        console.log(`[OK] 바이너리 파일 저장 완료: ${filePath}`);
      }
      
      return { success: true };
    } catch (error) {
      console.error('[ERROR] 파일 저장 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('ensure-dir', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return { success: true };
    } catch (error) {
      console.error('[ERROR] 디렉토리 생성 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('select-file', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(win, {
        title: '파일 선택',
        properties: ['openFile'],
        ...options
      });
      return result;
    } catch (error) {
      console.error('[ERROR] 파일 선택 실패:', error);
      return { canceled: true, filePaths: [] };
    }
  });

  ipcMain.handle('select-folder', async (event, options = {}) => {
    try {
      const result = await dialog.showOpenDialog(win, {
        title: '폴더 선택',
        properties: ['openDirectory'],
        ...options
      });
      return result;
    } catch (error) {
      console.error('[ERROR] 폴더 선택 실패:', error);
      return { canceled: true, filePaths: [] };
    }
  });

  ipcMain.handle('save-camera-lines', async (event, cameraId, linesData) => {
    try {
      const cameraKey = `camera${cameraId}`;
      const currentData = store.get('cameraLines', {});
      currentData[cameraKey] = { ...currentData[cameraKey], ...linesData };
      store.set('cameraLines', currentData);
      return { success: true };
    } catch (error) {
      console.error(`[ERROR] 카메라 ${cameraId} 선 정보 저장 실패:`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-camera-lines', async (event, cameraId) => {
    try {
      const cameraKey = `camera${cameraId}`;
      const cameraLines = store.get('cameraLines', {});
      const cameraData = cameraLines[cameraKey] || {
        lines: [],
        calibrationValue: 19.8,
        selectedLineColor: 'red'
      };
      return { success: true, data: cameraData };
    } catch (error) {
      console.error(`[ERROR] 카메라 ${cameraId} 선 정보 로드 실패:`, error);
      return { 
        success: false, 
        error: error.message,
        data: { lines: [], calibrationValue: 19.8, selectedLineColor: 'red' }
      };
    }
  });

  ipcMain.handle('load-all-camera-lines', async (event) => {
    try {
      const allCameraLines = store.get('cameraLines', {});
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

  ipcMain.handle('save-image-save-path', async (event, imageSavePath) => {
    try {
      store.set('imageSavePath', imageSavePath);
      return { success: true };
    } catch (error) {
      console.error('[ERROR] 이미지 저장 경로 설정 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-image-save-path', async (event) => {
    try {
      const imageSavePath = store.get('imageSavePath', 'C:');
      return { success: true, data: imageSavePath };
    } catch (error) {
      console.error('[ERROR] 이미지 저장 경로 로드 실패:', error);
      return { success: false, error: error.message, data: 'C:' };
    }
  });

  ipcMain.handle('load-csv-file', async (event, filePath) => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`파일이 존재하지 않습니다: ${filePath}`);
      }
      
      const fileData = parseDataFile(filePath);
      return { success: true, data: fileData };
    } catch (error) {
      console.error(`[ERROR] 데이터 파일 로드 실패:`, error);
      return { success: false, error: error.message, data: [] };
    }
  });

  // 기본 CSV 데이터 로드 (C:\inspector_config_data 폴더)
  ipcMain.handle('load-csv-data', async (event, configDir = 'C:\\inspector_config_data') => {
    try {
      console.log(`[INFO] CSV 데이터 로드 시작: ${configDir}`);
      
      const mtr2Path = path.join(configDir, 'mtr2.csv');
      const mtr4Path = path.join(configDir, 'mtr4.csv');
      
      const result = {
        mtr2: [],
        mtr4: []
      };
      
      // MTR2 파일 로드
      if (fs.existsSync(mtr2Path)) {
        result.mtr2 = parseDataFile(mtr2Path);
        console.log(`[OK] MTR2 데이터 로드 완료: ${result.mtr2.length}개 레코드`);
      } else {
        console.warn(`[WARN] MTR2 파일을 찾을 수 없음: ${mtr2Path}`);
      }
      
      // MTR4 파일 로드
      if (fs.existsSync(mtr4Path)) {
        result.mtr4 = parseDataFile(mtr4Path);
        console.log(`[OK] MTR4 데이터 로드 완료: ${result.mtr4.length}개 레코드`);
      } else {
        console.warn(`[WARN] MTR4 파일을 찾을 수 없음: ${mtr4Path}`);
      }
      
      return result;
    } catch (error) {
      console.error('[ERROR] CSV 데이터 로드 실패:', error);
      return {
        mtr2: [],
        mtr4: []
      };
    }
  });

  ipcMain.handle('save-admin-settings', async (event, settings) => {
    try {
      store.set('adminSettings', settings);
      return { success: true, message: '관리자 설정이 저장되었습니다.' };
    } catch (error) {
      console.error('[ERROR] 관리자 설정 저장 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-admin-settings', async (event) => {
    try {
      const settings = store.get('adminSettings', {});
      return { success: true, data: settings };
    } catch (error) {
      console.error('[ERROR] 관리자 설정 로드 실패:', error);
      return { success: false, error: error.message, data: {} };
    }
  });

  ipcMain.handle('save-parameters', async (event, parameters) => {
    try {
      store.set('parameters', parameters);
      return { success: true, message: '파라미터가 저장되었습니다.' };
    } catch (error) {
      console.error('[ERROR] 파라미터 저장 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-parameters', async (event) => {
    try {
      const parameters = store.get('parameters', {});
      return { success: true, data: parameters };
    } catch (error) {
      console.error('[ERROR] 파라미터 로드 실패:', error);
      return { success: false, error: error.message, data: {} };
    }
  });

  ipcMain.handle('camera-led-list-devices', async (event) => {
    try {
      const backendPath = getBackendPath();
      const scriptPath = path.join(backendPath, 'camera_led_control.py');
      
      const { stdout, stderr } = await execFileAsync('python', [scriptPath, 'list'], {
        cwd: backendPath,
        timeout: 10000
      });
      
      if (stderr) {
        console.warn('[WARN] 카메라 디바이스 조회 경고:', stderr);
      }
      
      const result = JSON.parse(stdout.trim());
      return result;
    } catch (error) {
      console.error('[ERROR] 카메라 디바이스 목록 조회 실패:', error);
      return { 
        success: false, 
        error: `카메라 디바이스 목록 조회 실패: ${error.message}` 
      };
    }
  });

  ipcMain.handle('camera-led-set-state', async (event, deviceIndex, ledState) => {
    try {
      const backendPath = getBackendPath();
      const scriptPath = path.join(backendPath, 'camera_led_control.py');
      
      const { stdout, stderr } = await execFileAsync('python', [
        scriptPath, 
        'set', 
        '--device-index', 
        deviceIndex.toString(), 
        '--led-state', 
        ledState.toString()
      ], {
        cwd: backendPath,
        timeout: 10000
      });
      
      if (stderr) {
        console.warn('[WARN] 카메라 LED 제어 경고:', stderr);
      }
      
      const result = JSON.parse(stdout.trim());
      return result;
    } catch (error) {
      console.error('[ERROR] 카메라 LED 제어 실패:', error);
      return { 
        success: false, 
        error: `카메라 LED 제어 실패: ${error.message}` 
      };
    }
  });

  ipcMain.handle('set-stored-value', async (event, key, value) => {
    try {
      store.set(key, value);
      return { success: true, message: '값이 성공적으로 저장되었습니다.' };
    } catch (error) {
      console.error('[ERROR] 값 저장 실패:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-stored-value', async (event, key) => {
    try {
      const value = store.get(key);
      return value;
    } catch (error) {
      console.error('[ERROR] 값 로드 실패:', error);
      return null;
    }
  });
}

async function createWindow() {
  try {
    console.log('[INFO] ========== 앱 시작 ==========');
    console.log(`[INFO] 환경: ${process.env.NODE_ENV || 'production'}`);
    console.log(`[INFO] 앱 경로: ${app.getAppPath()}`);
    console.log(`[INFO] Packaged: ${app.isPackaged}`);
    
    // IPC 핸들러 등록
    registerIpcHandlers();
    
    // 백엔드 서버 시작
    console.log('[STEP 1/3] 백엔드 서버 시작 중...');
    await startBackendServer();
    
    // 서버가 시작될 때까지 대기
    console.log('[STEP 2/3] 백엔드 서버 준비 대기 중...');
    const serverReady = await waitForBackend();
    
    if (!serverReady) {
      const result = dialog.showMessageBoxSync({
        type: 'warning',
        title: '서버 시작 실패',
        message: '카메라 서버가 30초 안에 시작되지 않았습니다.',
        detail: '카메라 초기화에 실패했을 수 있습니다.\n\n계속 진행하시겠습니까?\n(카메라 화면이 보이지 않을 수 있습니다)',
        buttons: ['계속 진행', '종료'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (result === 1) {
        app.quit();
        return;
      }
    }
    
    // 브라우저 창 생성
    console.log('[STEP 3/3] 브라우저 창 생성 중...');
    win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
    });

    // 개발/프로덕션 환경 구분
    if (!app.isPackaged) {
      console.log('[INFO] 개발 모드: http://localhost:5173 로드');
      win.loadURL("http://localhost:5173");
      win.webContents.openDevTools();
    } else {
      // 프로덕션 환경
      const isDev = !app.isPackaged;
      let indexPath;
      
      if (isDev) {
        // npm start로 실행한 경우
        indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      } else {
        // 패키징된 앱
        indexPath = path.join(__dirname, '..', 'dist', 'index.html');
      }
      
      console.log(`[INFO] 프로덕션 모드: ${indexPath} 로드`);
      
      if (fs.existsSync(indexPath)) {
        win.loadFile(indexPath);
        console.log('[OK] HTML 파일 로드 완료');
      } else {
        console.error(`[ERROR] HTML 파일을 찾을 수 없음: ${indexPath}`);
        
        // 가능한 경로들 시도
        const possiblePaths = [
          path.join(__dirname, '..', 'dist', 'index.html'),
          path.join(app.getAppPath(), 'dist', 'index.html'),
          path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
          path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
        ];
        
        console.log('[DEBUG] 가능한 HTML 경로들:');
        possiblePaths.forEach(p => {
          const exists = fs.existsSync(p);
          console.log(`  ${exists ? '[O]' : '[X]'} ${p}`);
        });
        
        const foundPath = possiblePaths.find(p => fs.existsSync(p));
        if (foundPath) {
          console.log(`[INFO] 대체 경로 사용: ${foundPath}`);
          win.loadFile(foundPath);
        } else {
          dialog.showErrorBox('오류', `앱 HTML 파일을 찾을 수 없습니다:\n${indexPath}`);
        }
      }
    }
    
    win.on('closed', () => {
      win = null;
    });
    
    console.log('[OK] ========== 창 생성 완료 ==========');
  } catch (err) {
    console.error('[ERROR] 앱 시작 오류:', err);
    dialog.showErrorBox('오류', `앱 시작 중 오류가 발생했습니다:\n${err.message}`);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    if (serverProcess) {
      console.log('[INFO] 카메라 서버에 안전 종료 요청 시도...');
      try {
        await axios.post('http://127.0.0.1:5000/shutdown', {}, { timeout: 3000 });
        console.log('[OK] 카메라 서버에 종료 요청 성공');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.warn('[WARN] 카메라 서버 종료 요청 실패:', error.message);
        
        if (process.platform === 'win32') {
          try {
            await exec(`taskkill /F /PID ${serverProcess.pid} /T`);
            console.log('[OK] 서버 프로세스 강제 종료 완료');
          } catch (killError) {
            console.warn('[WARN] 서버 프로세스 강제 종료 실패:', killError.message);
          }
        } else {
          serverProcess.kill('SIGKILL');
        }
      }
    }
    
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});