import negativeIcon from '../../../../assets/negativ-icon.svg';

// Der Fensterrahmen und seine Knöpfe kommen von Electron/Windows. Diese
// Leiste zeichnet nur den Inhalt der freien Fläche neben den Knöpfen.
export function WindowTitleBar({ context }: { context: string | null }) {
  return (
    <div className="window-titlebar" aria-hidden="true">
      <div className="window-titlebar-content">
        <img src={negativeIcon} alt="" width="22" height="22" draggable={false} />
        <span className="shrink-0 font-semibold">Lernjournal</span>
        {context && <span className="window-titlebar-context truncate">{context}</span>}
      </div>
    </div>
  );
}
