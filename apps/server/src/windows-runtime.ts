import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

/** Caller supplies the currently installed Appx location, never a PATH CLI. */
export function resolveWindowsDesktopCodex(installDirectory: string, exists=existsSync): string {
 if(!win32.isAbsolute(installDirectory)) throw new Error('Desktop install directory must be absolute');
 const cli=win32.join(installDirectory,'app','resources','codex.exe');
 if(!exists(cli)) throw new Error(`Desktop bundled CLI is missing: ${cli}; re-detect the current Appx installation`);
 return cli;
}
