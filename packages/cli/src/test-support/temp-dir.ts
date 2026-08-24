import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fresh temp directory per call, for tests that need a real filesystem project to point commands at. */
export async function createTempDir(prefix = "catalogus-cli-test-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeFixtureFile(dir: string, relativePath: string, text: string): Promise<string> {
  const filePath = join(dir, relativePath);
  await writeFile(filePath, text, "utf8");
  return filePath;
}
