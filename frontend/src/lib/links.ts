/** Ways out of Orbit: the folder in VS Code, the note in Obsidian, the session in a terminal. */

// biome-ignore lint/suspicious/noControlCharactersInRegex: exactly what must not get through
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * A local absolute path as the person knows it, or null. The text in the database may come from
 * anywhere: web addresses, relative paths and network shares never become links.
 */
export function folderPath(raw: string | null): string | null {
  const path = raw?.trim() ?? '';
  if (CONTROL.test(path)) return null;
  const windows = /^([a-z]):[\\/](.*)$/i.exec(path);
  if (windows) {
    const [, drive = '', rest = ''] = windows;
    const parts = rest.split(/[\\/]+/).filter(Boolean);
    return `${drive.toUpperCase()}:\\${parts.join('\\')}`;
  }
  if (!/^\/(?![\\/])/.test(path)) return null;
  return `/${path.split('/').filter(Boolean).join('/')}`;
}

export function vscodeUrl(raw: string | null): string | null {
  const path = folderPath(raw);
  if (path === null) return null;
  const parts = path.split(/[\\/]/).filter(Boolean);
  const encoded = parts.map((part, index) =>
    index === 0 && /^[A-Z]:$/.test(part) ? part : encodeURIComponent(part),
  );
  // Without windowId the folder may replace the one that is open now.
  return `vscode://file/${encoded.join('/')}?windowId=_blank`;
}

export function obsidianUrl(vault: string | null, note: string | null): string | null {
  const file = note?.trim().replaceAll('\\', '/');
  if (!vault || !file) return null;
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(file)}`;
}

/** For PowerShell: inside single quotes only a quote itself is special, and it is doubled. */
export function resumeCommand(folder: string | null, sessionId: string): string {
  const path = folderPath(folder);
  const resume = `claude --resume ${sessionId}`;
  return path === null ? resume : `cd '${path.replaceAll("'", "''")}'; ${resume}`;
}
