const { contextBridge, ipcRenderer } = require('electron');

// Electron API를 렌더러 프로세스에 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 카메라 ID 관련 API
  getCameraIds: () => ipcRenderer.invoke('get-camera-ids'),
  connectCameraById: (cameraId) => ipcRenderer.invoke('connect-camera-by-id', cameraId),
  
  // 카메라 프레임 관련 API
  getCameraFrame: (cameraIndex) => ipcRenderer.invoke('get-camera-frame', cameraIndex),
  startCameraStream: (cameraIndex) => ipcRenderer.invoke('start-camera-stream', cameraIndex),
  stopCameraStream: () => ipcRenderer.invoke('stop-camera-stream'),
  
  // 카메라 프레임 수신 리스너
  onCameraFrame: (callback) => {
    ipcRenderer.on('camera-frame', (event, frameData) => {
      callback(frameData);
    });
  },
  
  // 리스너 제거
  removeCameraFrameListener: () => {
    ipcRenderer.removeAllListeners('camera-frame');
  },
  
  // 기존 기능들 (호환성 유지)
  saveImage: (imageData, filename) => {
    return ipcRenderer.invoke('save-image', imageData, filename);
  }
});

console.log('[Preload] Electron API가 렌더러 프로세스에 노출되었습니다.');
