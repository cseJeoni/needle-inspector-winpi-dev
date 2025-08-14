const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /**
   * CSV 데이터를 로드하여 반환 (IPC를 통해 메인 프로세스에서 처리)
   * @param {string} configDir - 설정 디렉토리 경로 (기본값: C:\inspector_config_data)
   * @returns {Promise<Object>} MTR 2.0과 4.0 데이터를 포함한 객체
   */
  async loadCsvData(configDir = 'C:\\inspector_config_data') {
    try {
      console.log('[INFO] 메인 프로세스에 CSV 데이터 로드 요청...');
      const result = await ipcRenderer.invoke('load-csv-data', configDir);
      console.log('[INFO] CSV 데이터 로드 완료:', result);
      return result;
    } catch (error) {
      console.error('[ERROR] CSV 데이터 로드 실패:', error);
      return {
        mtr2: [],
        mtr4: []
      };
    }
  },
  // 기존에 다른 ipc 통신이 있었다면 여기에 추가
  // send: (channel, data) => ipcRenderer.send(channel, data),
  // on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
});

// Electron API를 렌더러 프로세스에 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 카메라 ID 관련 API
  getCameraIds: () => ipcRenderer.invoke('get-camera-ids'),
  connectCameraById: (cameraId) => ipcRenderer.invoke('connect-camera-by-id', cameraId),
  
  // 카메라 프레임 관련 API
  getCameraFrame: (cameraIndex) => ipcRenderer.invoke('get-camera-frame', cameraIndex),
  // 기존 기능들 (호환성 유지)
  saveImage: (imageData, filename) => {
    return ipcRenderer.invoke('save-image', imageData, filename);
  }
});

console.log('[Preload] Electron API가 렌더러 프로세스에 노출되었습니다.');
