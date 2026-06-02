const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getConfig: () => ipcRenderer.invoke('app:get-config'),
    selectDirectory: () => ipcRenderer.invoke('app:select-directory'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    probeVideo: (inputPath) => ipcRenderer.invoke('video:probe', inputPath),
    cancelTask: (taskId) => ipcRenderer.invoke('task:cancel', taskId),
    
    startSpeedChange: (params) => ipcRenderer.invoke('speed:start', params),
    startCompress: (params) => ipcRenderer.invoke('compress:start', params),
    startAudioExtract: (params) => ipcRenderer.invoke('audio:start', params),
    startRemux: (params) => ipcRenderer.invoke('remux:start', params),
    startSplit: (params) => ipcRenderer.invoke('split:start', params),
    startJoin: (params) => ipcRenderer.invoke('join:start', params),
    joinerProbe: (inputPath) => ipcRenderer.invoke('joiner:probe', inputPath),
    
    captureSingle: (params) => ipcRenderer.invoke('capture:single', params),
    captureBatch: (params) => ipcRenderer.invoke('capture:batch', params),
    detectScenes: (params) => ipcRenderer.invoke('capture:scene-detect', params),
    exportScenes: (params) => ipcRenderer.invoke('capture:export-scenes', params),
    
    resolveUniquePath: (desiredPath) => ipcRenderer.invoke('app:resolve-unique-path', desiredPath),

    // 진행 상황 이벤트 리스너 및 해제 기능 제공
    onProgress: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('task:progress', listener);
        // 해제 함수 반환
        return () => {
            ipcRenderer.removeListener('task:progress', listener);
        };
    }
});
