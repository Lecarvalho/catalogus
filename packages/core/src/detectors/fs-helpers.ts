import { access } from "node:fs/promises";

/** True when `path` exists (file or directory). Never throws. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
