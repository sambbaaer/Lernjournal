// Programmsymbol aus build/icon.svg erzeugen: build/icon.png (512 px, Linux),
// build/icon.ico (16–256 px, Windows) und die Logos/Kacheln des MSIX-Pakets in
// build/appx/ (Microsoft Store, Liste in scripts/appx-assets.ts). Läuft in
// Electron, weil Chromium das SVG genau so zeichnet, wie es später erscheint –
// ohne Zusatzprogramm. Alles stammt aus dem eigenen SVG, keine fremden Bilder.
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
const buildDir = path.resolve(import.meta.dirname, '../build');
const svg = readFileSync(path.join(buildDir, 'icon.svg'), 'utf8');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><title>icon</title>');
  const sizes = [...ICO_SIZES, PNG_SIZE];
  // Im Fenster: SVG als Bild laden, je Grösse auf eine Leinwand zeichnen
  const rendered = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
    await img.decode();
    return ${JSON.stringify(sizes)}.map((size) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, size, size);
      return { size, rgba: Array.from(g.getImageData(0, 0, size, size).data), png: c.toDataURL('image/png') };
    });
  })()`);
  const pngBytes = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const images = rendered.map((r) => ({ size: r.size, rgba: Uint8Array.from(r.rgba), png: pngBytes(r.png) }));
  writeFileSync(path.join(buildDir, 'icon.png'), images.find((i) => i.size === PNG_SIZE).png);
  writeFileSync(path.join(buildDir, 'icon.ico'), encodeIco(images.filter((i) => ICO_SIZES.includes(i.size))));
  console.log(`build/icon.png (${PNG_SIZE} px) und build/icon.ico (${ICO_SIZES.join(', ')} px) geschrieben`);

  // MSIX: Symbol mittig auf durchsichtiger Fläche in der verlangten Grösse.
  // Das SVG wird je Datei in der Zielgrösse gezeichnet (scharf, nicht skaliert).
  const assets = appxAssets();
  const appxPngs = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(svg).toString('base64'))};
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
  const appxDir = path.join(buildDir, 'appx');
  // Alte Dateien entfernen, damit nichts Veraltetes ins Paket gelangt
  mkdirSync(appxDir, { recursive: true });
  for (const f of readdirSync(appxDir)) rmSync(path.join(appxDir, f));
  assets.forEach((a, i) => writeFileSync(path.join(appxDir, a.file), pngBytes(appxPngs[i])));
  console.log(`build/appx/: ${assets.length} Logos und Kacheln für das MSIX geschrieben`);
  app.exit(0);
});
