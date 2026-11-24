// Programm- und Dateisymbol sowie die 45 MSIX-Logos/Kacheln aus den SVGs in
// assets/ erzeugen (build/icon.png, build/icon.ico, build/ajournal.ico und
// build/appx/*.png). Chromium zeichnet die Vektoren scharf in den Zielgrössen.
//
//   npm run icon
// (unter Linux ohne Bildschirm: xvfb-run -a npx electron --no-sandbox scripts/render-icon.mjs)
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { appxAssets } from './appx-assets.ts';
import { encodeIco } from './icon.ts';

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
const PNG_SIZE = 512;
const repo = path.resolve(import.meta.dirname, '..');
const buildDir = path.join(repo, 'build');

async function renderIcon(win, source, sizes) {
  const svg = readFileSync(path.join(repo, 'assets', source));
  const rendered = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(svg.toString('base64'))};
    await img.decode();
    return ${JSON.stringify(sizes)}.map((size) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, size, size);
      return { size, rgba: g.getImageData(0, 0, size, size).data, png: c.toDataURL('image/png').split(',')[1] };
    });
  })()`);
  return rendered.map(({ size, rgba, png }) => ({ size, rgba, png: Buffer.from(png, 'base64') }));
}

app.disableHardwareAcceleration();
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>icon</title>');
    const program = await renderIcon(win, 'app-icon.svg', [...ICO_SIZES, PNG_SIZE]);
    const file = await renderIcon(win, 'file-icon.svg', ICO_SIZES);
    writeFileSync(path.join(buildDir, 'icon.png'), program.find((i) => i.size === PNG_SIZE).png);
    writeFileSync(path.join(buildDir, 'icon.ico'), encodeIco(program.filter((i) => i.size !== PNG_SIZE)));
    writeFileSync(path.join(buildDir, 'ajournal.ico'), encodeIco(file));
    console.log(`build/icon.png, build/icon.ico und build/ajournal.ico geschrieben`);

    // MSIX: Symbol mittig auf durchsichtiger Fläche in der verlangten Grösse.
    const appSvg = readFileSync(path.join(repo, 'assets', 'app-icon.svg'));
    const assets = appxAssets();
    const appxPngs = await win.webContents.executeJavaScript(`(async () => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(appSvg.toString('base64'))};
      await img.decode();
      return ${JSON.stringify(assets)}.map((a) => {
        const c = document.createElement('canvas');
        c.width = a.width;
        c.height = a.height;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, Math.round((a.width - a.iconSize) / 2), Math.round((a.height - a.iconSize) / 2), a.iconSize, a.iconSize);
        return c.toDataURL('image/png');
      });
    })()`);
    const pngBytes = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    const appxDir = path.join(buildDir, 'appx');
    mkdirSync(appxDir, { recursive: true });
    for (const f of readdirSync(appxDir)) rmSync(path.join(appxDir, f));
    assets.forEach((a, i) => writeFileSync(path.join(appxDir, a.file), pngBytes(appxPngs[i])));
    console.log(`build/appx/: ${assets.length} Logos und Kacheln für das MSIX geschrieben`);
    app.exit(0);
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
