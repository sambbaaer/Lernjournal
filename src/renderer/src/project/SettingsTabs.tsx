import { useEffect, useId, useRef } from 'react';
import { useApp } from '../state/AppContext';
import type { SettingsTab } from '../state/app-state';
import { handleRovingKeys } from '../shell/roving';
import { McpSettings } from './McpSettings';
import { SettingsPanel } from './SettingsPanel';

const tabs: { id: SettingsTab; title: string }[] = [
  { id: 'general', title: 'Allgemein' },
  { id: 'mcp', title: 'MCP' },
];

export function SettingsTabs() {
  const { state, dispatch } = useApp();
  const id = useId();
  const mcpRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (state.focusRequest !== 'settings-mcp') return;
    mcpRef.current?.focus();
    dispatch({ type: 'requestFocus', target: null });
  }, [state.focusRequest, dispatch]);

  return (
    <>
      <div
        role="tablist"
        aria-label="Einstellungsbereiche"
        className="flex gap-1 border-b border-border"
        onKeyDown={(event) => handleRovingKeys(event, 'horizontal', '[role="tab"]')}
      >
        {tabs.map((tab) => {
          const selected = state.settingsTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={tab.id === 'mcp' ? mcpRef : undefined}
              role="tab"
              type="button"
              id={`${id}-tab-${tab.id}`}
              aria-controls={`${id}-panel-${tab.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onFocus={() => dispatch({ type: 'selectSettingsTab', tab: tab.id })}
              onClick={() => dispatch({ type: 'selectSettingsTab', tab: tab.id })}
              className={`border-b-[3px] px-4 py-2 text-sm ${selected ? 'border-accent font-semibold' : 'border-transparent text-ink-muted hover:text-ink'}`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-general`}
        aria-labelledby={`${id}-tab-general`}
        hidden={state.settingsTab !== 'general'}
      >
        <SettingsPanel />
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel-mcp`}
        aria-labelledby={`${id}-tab-mcp`}
        hidden={state.settingsTab !== 'mcp'}
      >
        <McpSettings />
      </div>
    </>
  );
}
