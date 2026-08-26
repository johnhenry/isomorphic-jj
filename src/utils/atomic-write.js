/**
 * Shared atomic-write helper for filesystem writes.
 *
 * Writes content to a uniquely-named temp file, then renames it over the
 * canonical path. A crash/error between those two steps leaves the
 * canonical file untouched (never a truncated/partial write) — the temp
 * file is best-effort cleaned up on failure.
 *
 * This mirrors the pattern `Storage.write()` (src/core/storage-manager.js)
 * already uses for JSON stores, factored out so the protobuf-backed stores
 * (JJOperationStore, JJViewStore, JJTreeState) can use it too instead of
 * calling `writeFile()` directly on the canonical path — see issue #16.
 */

/**
 * @param {any} fs - Filesystem implementation (Node fs, LightningFS, etc.)
 * @param {string} targetPath - Canonical path to write to
 * @param {string|Uint8Array} content - Content to write
 */
export async function atomicWriteFile(fs, targetPath, content) {
  const tmpSuffix =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const tmpPath = `${targetPath}.tmp.${Date.now()}.${tmpSuffix}`;

  try {
    const dirPath = targetPath.substring(0, targetPath.lastIndexOf('/'));
    if (dirPath) {
      await fs.promises.mkdir(dirPath, { recursive: true });
    }

    await fs.promises.writeFile(tmpPath, content);
    await fs.promises.rename(tmpPath, targetPath);
  } catch (error) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      // Best-effort cleanup; ignore if the temp file was never created (or
      // is already gone).
    }
    throw error;
  }
}
