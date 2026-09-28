// Aldermere as a desktop app: a plain window around the built game (dist/), no browser
// bars. F11 toggles fullscreen. Esc still frees the mouse like it does in the game.
const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');

// A fixed address for the game, so saves in local storage stay put between launches.
protocol.registerSchemesAsPrivileged([
  { scheme: 'aldermere', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#0d1117',
    title: 'Aldermere',
    autoHideMenuBar: true,
    fullscreen: process.argv.includes('--fullscreen'),
    webPreferences: { backgroundThrottling: false },
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.loadURL('aldermere://game/index.html');
}

app.whenReady().then(() => {
  protocol.handle('aldermere', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => app.quit());
