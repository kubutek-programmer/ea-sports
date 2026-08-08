const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    sendMessage: (msg) => ipcRenderer.invoke('send-message', msg),
    onMessage: (cb) => ipcRenderer.on('chat-message', (_, data) => cb(data)),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    getConfig: () => ipcRenderer.invoke('get-config'),
    switchVideo: (videoId) => ipcRenderer.invoke('switch-video', videoId),
    setMaxMessages: (count) => ipcRenderer.invoke('set-max-messages', count),
    onClearChat: (cb) => ipcRenderer.on('clear-chat', () => cb()),
    onShowVideoPrompt: (cb) => ipcRenderer.on('show-video-prompt', () => cb()),
    onShowMaxMessagesPrompt: (cb) => ipcRenderer.on('show-max-messages-prompt', () => cb())
});