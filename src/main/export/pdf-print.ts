import { BrowserWindow, nativeImage, session } from 'electron';
import { APP_HOST, APP_ORIGIN, APP_SCHEME } from '../security';
import type { DocxImage } from './docx-content';
import type { PdfDocument } from './pdf-document';

const PDF_PATH = '/print/document';
const IMAGE_PATH = '/print/image/';

// Rund 180 ppi für 17.2 × 12 cm Satzspiegel. PNG behält Transparenz und
// scharfe Kanten, Fotos bleiben JPEG. Kleine Bilder werden nicht vergrössert.
function pdfImage(image: DocxImage): Buffer {
  const scale = Math.min(1200 / image.widthPx, 850 / image.heightPx);
  const data = Buffer.from(image.data);
  if (scale >= 1) return data;
  const resized = nativeImage.createFromBuffer(data).resize({
    width: Math.max(1, Math.round(image.widthPx * scale)),
    height: Math.max(1, Math.round(image.heightPx * scale)),
    quality: 'best',
  });
  const result = image.type === 'png' ? resized.toPNG() : resized.toJPEG(86);
  return result.length > 0 ? result : data;
}

export async function printPdf(document: PdfDocument): Promise<Uint8Array> {
  // Eine flüchtige, von der Hauptoberfläche getrennte Session liefert nur
  // dieses Dokument und seine aufgelösten Bilder. Kein Preload, keine Skripte.
  const printSession = session.fromPartition('pdf-print', { cache: false });
  printSession.setPermissionCheckHandler(() => false);
  printSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  printSession.webRequest.onBeforeRequest(({ url }, callback) =>
    callback({ cancel: !url.startsWith(`${APP_ORIGIN}/print/`) }),
  );
  const noCache = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: printSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      javascript: false,
      spellcheck: false,
    },
  });
  try {
    printSession.protocol.handle(APP_SCHEME, (request) => {
      const url = new URL(request.url);
      if (url.host === APP_HOST && url.pathname === PDF_PATH) {
        return new Response(document.html, {
          headers: {
            ...noCache,
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'",
          },
        });
      }
      if (url.host === APP_HOST && url.pathname.startsWith(IMAGE_PATH)) {
        const image = document.images.get(url.pathname.slice(IMAGE_PATH.length));
        if (image)
          return new Response(new Uint8Array(pdfImage(image)), {
            headers: {
              ...noCache,
              'Content-Type': image.type === 'png' ? 'image/png' : 'image/jpeg',
            },
          });
      }
      return new Response(null, { status: 404 });
    });
    await win.loadURL(`${APP_ORIGIN}${PDF_PATH}`);
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
      generateDocumentOutline: true,
    });
  } finally {
    if (!win.isDestroyed()) win.destroy();
    printSession.protocol.unhandle(APP_SCHEME);
  }
}
