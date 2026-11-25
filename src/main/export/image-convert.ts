// WebP → PNG für den Word-Export.
//
// Warum? Lernjournal speichert Bilder als JPEG, PNG oder WebP (AJ-07). Word
// kann WebP je nach Version nicht anzeigen, und `docx` bettet nur PNG/JPEG
// sicher ein. Der Hauptprozess hat keinen WebP-Decoder (Electron `nativeImage`
// kann kein WebP, und native Module wollen wir nicht – ADR 0001).
//
// Lösung: ein unsichtbares Fenster mit den Chromium-Bordmitteln
// (createImageBitmap + OffscreenCanvas) – dieselben, die schon beim Einfügen
// das Bild verarbeitet haben. Das Fenster ist so abgeschottet wie das
// Hauptfenster (Sandbox, keine Node-Rechte) und hat KEIN Preload, also auch
// keinen Zugang zu IPC-Befehlen; es lädt nur «about:blank». Die Bytes gehen als
// Base64 hinein, PNG-Bytes kommen als Base64 zurück. WebP-Bilder sind selten
// (meist Bilder aus dem Web) – darum ein Fenster je Bild, danach sofort zu.
import { BrowserWindow } from 'electron';

const TIMEOUT_MS = 20_000;

// Läuft im unsichtbaren Fenster. Bewusst als Text (nicht als TS-Funktion), damit
// der Bundler nichts daran verändert. «__B64__» wird durch die Daten ersetzt.
const PAGE_SCRIPT = `(async () => {
  const bytes = Uint8Array.from(atob(__B64__), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let s = '';
  for (let i = 0; i < png.length; i += 0x8000) s += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return btoa(s);
})()`;

export async function convertWebpToPng(data: Uint8Array): Promise<Uint8Array> {
  return runInHiddenWindow(
    PAGE_SCRIPT.replace('__B64__', JSON.stringify(Buffer.from(data).toString('base64'))),
  );
}

// Skript im verborgenen, abgeschotteten Fenster ausführen; Ergebnis = Base64-Bytes
async function runInHiddenWindow(script: string): Promise<Uint8Array> {
  const win = new BrowserWindow({
    show: false,
    width: 100,
    height: 100,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await win.loadURL('about:blank');
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Zeitüberschreitung bei der Bildumwandlung')), TIMEOUT_MS);
    });
    const out = (await Promise.race([win.webContents.executeJavaScript(script), timeout])) as unknown;
    if (typeof out !== 'string') throw new Error('Unerwartete Antwort der Bildumwandlung');
    return new Uint8Array(Buffer.from(out, 'base64'));
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}

// Bild-Schnellbeschriftung (AJ-32) für den Word-Export: Foto und SVG der
// Beschriftung im selben abgeschotteten, verborgenen Fenster zu einem Bild
// zusammenrechnen. JPEG-Fotos bleiben JPEG (kleinere Datei), sonst PNG.
const ANNOTATE_SCRIPT = `(async () => {
  const bytes = Uint8Array.from(atob(__B64__), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: __MIME__ }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const url = URL.createObjectURL(new Blob([__SVG__], { type: 'image/svg+xml' }));
  const img = new Image();
  img.src = url;
  await img.decode();
  ctx.drawImage(img, 0, 0, bitmap.width, bitmap.height);
  URL.revokeObjectURL(url);
  bitmap.close();
  const out = await canvas.convertToBlob(__MIME__ === 'image/jpeg' ? { type: 'image/jpeg', quality: 0.92 } : { type: 'image/png' });
  const data = new Uint8Array(await out.arrayBuffer());
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
})()`;

export async function renderAnnotatedImage(
  image: { data: Uint8Array; type: 'png' | 'jpg' },
  svg: string,
): Promise<Uint8Array> {
  const script = ANNOTATE_SCRIPT.replace(
    '__B64__',
    JSON.stringify(Buffer.from(image.data).toString('base64')),
  )
    .replaceAll('__MIME__', JSON.stringify(image.type === 'jpg' ? 'image/jpeg' : 'image/png'))
    // Funktion als Ersatz: «$» im Beschriftungstext darf nicht als Ersetzungsmuster wirken
    .replace('__SVG__', () => JSON.stringify(svg));
  return runInHiddenWindow(script);
}
