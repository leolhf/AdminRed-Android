/**
 * main.js — Proceso principal de Electron.
 *
 * Empaqueta la misma app web (carpeta www/) que ya corre en Android (Capacitor)
 * como una app de escritorio para Windows/Linux/Mac, sin tocar el código de la
 * app: el detector de plataforma (RN.platform.esNativo()) ya hace que todo el
 * código que usa plugins de Capacitor (Filesystem, Contacts, LocalNotifications)
 * caiga automáticamente a sus equivalentes web (File System Access API, Web
 * Notifications API), igual que cuando corre en el navegador (PWA).
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow;

// Una sola instancia — evita abrir dos ventanas a la vez, que pisarían el
// mismo localStorage o el mismo archivo vinculado entre sí.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      icon: path.join(__dirname, 'build', 'icon.ico'),
      autoHideMenuBar: true, // oculta la barra de menú (Archivo/Editar/Ver...); no la usa esta app
      backgroundColor: '#f1f5f9',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    mainWindow.loadFile(path.join(__dirname, 'www', 'index.html'));

    // Los enlaces externos (WhatsApp Web, GitHub Releases, etc.) se abren en
    // el navegador del sistema, no dentro de la propia ventana de la app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    Menu.setApplicationMenu(null);
  }

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
