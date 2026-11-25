// Vite-Import «?raw»: Dateiinhalt als Text (z. B. die MCP-Brücke für die
// Claude-Desktop-Erweiterung, client-config.ts). electron-vite deklariert nur «?asset».
declare module '*?raw' {
  const content: string;
  export default content;
}
