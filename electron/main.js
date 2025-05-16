/* eslint-disable no-undef */

const { app, BrowserWindow } = require("electron");
const path = require("path");

require("electron-reload")(__dirname);

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);
/* eslint-enable no-undef */
