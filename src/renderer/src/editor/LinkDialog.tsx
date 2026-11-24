// Dialog «Weblink einfügen». Nur https/http-Adressen; «www.» wird ergänzt.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

export function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const withProto = /^www\./i.test(v) ? `https://${v}` : v;
  try {
    const u = new URL(withProto);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function LinkDialog({
  initial,
  onSubmit,
  onRemove,
  onCancel,
}: {
  initial: string;
  onSubmit: (url: string) => void;
  onRemove: (() => void) | null;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(value);
    if (!url) return setError('Bitte eine Webadresse eingeben, z. B. https://www.fogra.org');
    onSubmit(url);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30" onKeyDown={onKeyDown}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-title"
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-md bg-surface p-6 shadow-xl"
      >
        <h2 id="link-title" className="text-lg font-semibold">
          Weblink
        </h2>
        <div>
          <label htmlFor="link-url" className="mb-1 block text-sm font-semibold">
            Adresse
          </label>
          <input
            ref={inputRef}
            id="link-url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'link-error' : undefined}
            className="w-full rounded-sm border border-border-strong px-3 py-2 text-sm"
          />
          {error && (
            <p id="link-error" className="mt-1 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <div>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-sm px-3 py-2 text-sm hover:bg-hover"
              >
                Link entfernen
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-sm border border-border-strong px-4 py-2 text-sm hover:bg-hover"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-white hover:bg-action-hover"
            >
              Übernehmen
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
