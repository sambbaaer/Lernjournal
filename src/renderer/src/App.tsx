// Wurzel der Oberfläche: lädt App-Infos und Projektstand über die sichere
// Brücke und zeigt Startbildschirm, Assistent oder die App-Shell.
import { useEffect, useState } from 'react';
import { DISTRIBUTION_LABELS } from '@shared/ipc';
import { AppShell } from './shell/AppShell';
import { AppProvider, useApp } from './state/AppContext';

function ProjectLoader() {
  const { dispatch } = useApp();
  useEffect(() => {
    // Öffnet beim Start automatisch das zuletzt verwendete Projekt (im Hauptprozess)
    void window.lernjournal.project.getState().then((res) => {
      if (res.ok) dispatch({ type: 'projectState', ...res.data });
      else dispatch({ type: 'projectState', project: null, recent: [], suggestedLocation: '' });
    });
  }, [dispatch]);
  return null;
}

function McpLoader() {
  const { dispatch } = useApp();
  useEffect(() => {
    let active = true;
    let version = 0;
    const refresh = () => {
      const request = ++version;
      void window.lernjournal.mcp
        .status()
        .then((result) => {
          if (active && request === version && result.ok)
            dispatch({ type: 'mcpStatus', status: result.data });
        })
        .catch(() => {});
    };
    const unsubscribe = window.lernjournal.mcp.onChanged(refresh);
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [dispatch]);
  return null;
}

export function App() {
  const [version, setVersion] = useState<string | null>(null);
  // Verteilungsart für «Info» (z. B. «Microsoft Store»), hilft bei Rückfragen
  const [variant, setVariant] = useState<string | null>(null);

  useEffect(() => {
    window.lernjournal.app
      .getInfo()
      .then((res) => {
        setVersion(res.ok ? res.data.version : null);
        setVariant(res.ok ? DISTRIBUTION_LABELS[res.data.distribution] : null);
      })
      .catch(() => setVersion(null));
  }, []);

  return (
    <AppProvider>
      <ProjectLoader />
      <McpLoader />
      <AppShell version={version} variant={variant} />
    </AppProvider>
  );
}
