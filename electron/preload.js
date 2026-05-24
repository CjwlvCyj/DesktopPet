const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPet', {
  onPetPackLoaded: (callback) => ipcRenderer.on('petpack-loaded', (_, payload) => callback(payload)),
  onPlayAction: (callback) => ipcRenderer.on('play-action', (_, payload) => callback(payload)),
  onShowBubble: (callback) => ipcRenderer.on('show-bubble', (_, payload) => callback(payload)),
  onRendererPaused: (callback) => ipcRenderer.on('renderer-paused', (_, paused) => callback(paused)),
  onPetScaleChanged: (callback) => ipcRenderer.on('pet-scale-changed', (_, payload) => callback(payload)),
  onSettingsState: (callback) => ipcRenderer.on('settings-state', (_, payload) => callback(payload)),
  onDragVisualOffset: (callback) => ipcRenderer.on('drag-visual-offset', (_, payload) => callback(payload)),
  sendPetEvent: (eventName) => ipcRenderer.send('pet-event', eventName),
  setMouseIgnore: (ignored) => ipcRenderer.send('set-content-mouse-ignored', !!ignored),
  beginDrag: (payload) => ipcRenderer.send('begin-drag', payload),
  endDrag: () => ipcRenderer.send('end-drag'),
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  getSettingsState: () => ipcRenderer.invoke('get-settings-state'),
  setPetScale: (scale) => ipcRenderer.invoke('set-pet-scale', scale),
  resetPetScale: () => ipcRenderer.invoke('reset-pet-scale')
});
