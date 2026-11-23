// Platzhalter-Oberfläche für AJ-01. Die Office-ähnliche App-Shell
// (Datei-Menü, Ribbon, Navigation, Statusleiste) folgt mit AJ-02.
import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/ipc';

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Beim Start einmal die App-Infos über die sichere Brücke holen.
  useEffect(() => {
    window.lernjournal.app
      .getInfo()
      .then((res) => (res.ok ? setInfo(res.data) : setError(res.error.message)))
      .catch(() => setError('Verbindung zum Hauptprozess fehlgeschlagen'));
  }, []);

  return (
    <main className="flex h-full items-center justify-center p-8">
      <section className="w-full max-w-lg rounded-md border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Lernjournal</h1>
        <p className="mt-2 text-ink-muted">
          Grundgerüst steht. Die Office-ähnliche Oberfläche folgt im nächsten Schritt.
        </p>
        <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" aria-live="polite">
          {info ? (
            <>
              <dt className="text-ink-muted">Version</dt>
              <dd data-testid="app-version">{info.version}</dd>
              <dt className="text-ink-muted">Electron</dt>
              <dd>{info.versions.electron}</dd>
              <dt className="text-ink-muted">Betrieb</dt>
              <dd>offline, ohne Konto</dd>
            </>
          ) : (
            <dd className="col-span-2 text-ink-muted">{error ?? 'Lädt …'}</dd>
          )}
        </dl>
        <p className="mt-6 text-xs text-ink-muted">
          Inoffizielles Hilfsmittel – nicht herausgegeben von SBFI, dpsuisse oder Prüfungsorganen.
        </p>
      </section>
    </main>
  );
}
