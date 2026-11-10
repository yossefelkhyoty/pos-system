//preload.js

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveData: (date, data) => ipcRenderer.send('save-data', { date, data }),
  loadData: (date) => ipcRenderer.send('load-data', date),
  onLoadDataResponse: (callback) => ipcRenderer.on('load-data-response', (event, data) => callback(data))
});
