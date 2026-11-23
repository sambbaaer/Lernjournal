// Wurzel der Oberfläche: lädt die App-Infos über die sichere Brücke und
// zeigt die Office-ähnliche App-Shell.
import { useEffect, useState } from 'react';
import { AppShell } from './shell/AppShell';
import { AppProvider } from './state/AppContext';

export function App() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    window.lernjournal.app
      .getInfo()
      .then((res) => setVersion(res.ok ? res.data.version : null))
      .catch(() => setVersion(null));
  }, []);

  return (
    <AppProvider>
      <AppShell version={version} />
    </AppProvider>
  );
}
