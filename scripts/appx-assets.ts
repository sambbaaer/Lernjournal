// Logos und Kacheln für das MSIX-Paket (Microsoft Store, AJ-16b).
// Eine Liste für beides: scripts/render-icon.mjs zeichnet daraus die PNG-Dateien
// in build/appx/, scripts/packaging.test.ts prüft, dass alle da sind und die
// richtige Grösse haben. electron-builder nimmt jede Datei aus build/appx/ ins
// Paket; fehlt eines der Standard-Logos, setzt es Beispielbilder ein – die
// Store-Zertifizierung lehnt solche Standardbilder ab.
//
// Namen nach Microsoft: <Logo>.scale-<Prozent>.png für die Anzeigeskalierung,
// beim App-Symbol (Square44x44Logo) zusätzlich .targetsize-<px> für Taskleiste,
// Startmenü-Liste und Explorer – «altform-unplated» ohne farbige Platte,
// «altform-lightunplated» für helle Taskleisten. Unser Symbol hat einen eigenen
// Hintergrund und passt auf beide.
//
// Nur «löschbare» TypeScript-Syntax: Node/Electron führen die Datei direkt aus.

export type AppxLogo = {
  // Dateiname ohne Endung, so wie ihn electron-builder im Manifest einsetzt
  name: string;
  // Grösse bei 100 % Skalierung
  width: number;
  height: number;
  // Anteil der kürzeren Seite, den das Symbol einnimmt (Rest durchsichtig)
  iconFraction: number;
  // Standard-Logo: ohne eigene Datei würde electron-builder ein Beispielbild nehmen
  required: boolean;
};

export const APPX_LOGOS: readonly AppxLogo[] = [
  // Store-Eintrag und Paketliste
  { name: 'StoreLogo', width: 50, height: 50, iconFraction: 1, required: true },
  // App-Symbol: Startmenü-Liste, Taskleiste, Einstellungen → Apps
  { name: 'Square44x44Logo', width: 44, height: 44, iconFraction: 1, required: true },
  // Kacheln im Startmenü von Windows 10 (klein, mittel, breit, gross)
  { name: 'SmallTile', width: 71, height: 71, iconFraction: 0.8, required: false },
  { name: 'Square150x150Logo', width: 150, height: 150, iconFraction: 0.6, required: true },
  { name: 'Wide310x150Logo', width: 310, height: 150, iconFraction: 0.6, required: true },
  { name: 'LargeTile', width: 310, height: 310, iconFraction: 0.5, required: false },
];

// Skalierungen laut Microsoft-Empfehlung (100 % ist Pflicht, 200 % für hohe Auflösung)
export const APPX_SCALES = [100, 125, 150, 200, 400] as const;

// Feste Pixelgrössen des App-Symbols (Taskleiste, Explorer, Alt+Tab)
export const APPX_TARGET_SIZES = [16, 24, 32, 48, 256] as const;

export type AppxAsset = { file: string; width: number; height: number; iconSize: number };

// Alle Dateien, die in build/appx/ liegen müssen
export function appxAssets(): AppxAsset[] {
  const out: AppxAsset[] = [];
  for (const logo of APPX_LOGOS) {
    for (const scale of APPX_SCALES) {
      const width = Math.round((logo.width * scale) / 100);
      const height = Math.round((logo.height * scale) / 100);
      out.push({
        file: `${logo.name}.scale-${scale}.png`,
        width,
        height,
        iconSize: Math.round(Math.min(width, height) * logo.iconFraction),
      });
    }
  }
  for (const size of APPX_TARGET_SIZES) {
    for (const suffix of ['', '_altform-unplated', '_altform-lightunplated']) {
      out.push({
        file: `Square44x44Logo.targetsize-${size}${suffix}.png`,
        width: size,
        height: size,
        iconSize: size,
      });
    }
  }
  return out;
}
