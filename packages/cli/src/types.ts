// Shared shape every command function returns. Commands never print or call
// process.exit() themselves -- that split is what lets tests call a command
// function directly and assert on plain data (see cli.ts, which is the only
// place stdout/stderr actually get written and process.exitCode gets set).
export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
