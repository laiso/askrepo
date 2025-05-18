import { join } from "jsr:@std/path@1";
import { compile } from "jsr:@cfa/gitignore-parser@0.1.4";
import { expandGlob } from "jsr:@std/fs@1";

const MAX_SCAN_SIZE = 1024;
const NO_OP_DENIES = (_path: string) => false;

// Constants for file type detection
const MAGIC_NUMBERS: Record<string, Uint8Array> = {
  JPEG: new Uint8Array([0xFF, 0xD8, 0xFF]),
  PNG: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  GIF87: new TextEncoder().encode("GIF87a"),
  GIF89: new TextEncoder().encode("GIF89a"),
  BMP: new Uint8Array([0x42, 0x4D]), // Added BMP magic number
};

const MAX_MAGIC_NUMBER_LENGTH = Math.max(
  ...Object.values(MAGIC_NUMBERS).map((arr) => arr.length),
);

// Common binary file extensions
const BINARY_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "exe",
  "dll",
]);

/**
 * Determines if a file is binary based on its extension
 */
export function isBinaryFileByExtension(file: string): boolean {
  const parts = file.split(".");
  if (parts.length === 0) return false;
  const ext = parts[parts.length - 1].toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Determines if a file is binary by examining its content
 */
export async function isBinaryFileByContent(file: string): Promise<boolean> {
  try {
    const file_obj = await Deno.open(file, { read: true });
    try {
      const bytesToRead = Math.max(MAX_SCAN_SIZE, MAX_MAGIC_NUMBER_LENGTH);
      const buffer = new Uint8Array(bytesToRead);
      const bytesRead = await file_obj.read(buffer);

      if (bytesRead === null) return false;

      const data = buffer.subarray(0, bytesRead);

      // Check for NULL bytes
      if (data.findIndex((byte) => byte === 0) !== -1) {
        return true;
      }

      // Check against magic numbers
      for (const magic of Object.values(MAGIC_NUMBERS)) {
        if (data.length < magic.length) continue;

        let match = true;
        for (let j = 0; j < magic.length; j++) {
          if (data[j] !== magic[j]) {
            match = false;
            break;
          }
        }
        if (match) return true;
      }
      return false;
    } finally {
      file_obj.close();
    }
  } catch (error: unknown) {
    console.error(`Error reading file for binary check ${file}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to check if file is binary: ${errorMessage}`);
  }
}

/**
 * Determines if a file is binary
 */
export async function isBinaryFile(file: string): Promise<boolean> {
  return isBinaryFileByExtension(file) || (await isBinaryFileByContent(file));
}

/**
 * Load gitignore rules
 */
async function loadGitignoreFile(
  gitignorePath: string,
  gitignoreCache: Map<string, { denies: (path: string) => boolean }>,
  verbose = false,
): Promise<{ denies: (path: string) => boolean }> {
  if (!gitignoreCache.has(gitignorePath)) {
    try {
      const gitignoreContent = await Deno.readTextFile(gitignorePath);
      const matcher = compile(gitignoreContent);
      gitignoreCache.set(gitignorePath, matcher);
      if (verbose) {
        console.log(`Loaded .gitignore from ${gitignorePath}`);
      }
      return matcher;
    } catch (_e) {
      if (verbose) {
        console.log(`No .gitignore found at ${gitignorePath}`);
      }
      const noOpMatcher = { denies: NO_OP_DENIES };
      gitignoreCache.set(gitignorePath, noOpMatcher);
      return noOpMatcher;
    }
  }
  return gitignoreCache.get(gitignorePath)!;
}

/**
 * Traverse directory and get list of files filtered by .gitignore rules
 */
export async function getTrackedFiles(
  basePath: string,
  verbose = false,
): Promise<string[]> {
  if (verbose) {
    console.log(`${basePath} is the base path`);
  }

  const files: string[] = [];
  const gitignoreCache = new Map<
    string,
    { denies: (path: string) => boolean }
  >();

  async function traverseDirectory(
    dirPath: string,
    currentRules: Array<
      { path: string; matcher: { denies: (path: string) => boolean } }
    > = [],
  ): Promise<void> {
    const gitignorePath = join(dirPath, ".gitignore");
    let dirRules = [...currentRules];

    // Check if this is a Git repository root
    try {
      const gitDirPath = join(dirPath, ".git");
      await Deno.stat(gitDirPath);
      if (verbose) {
        console.log(`Found Git repository root at ${dirPath}`);
      }
      const matcher = await loadGitignoreFile(
        gitignorePath,
        gitignoreCache,
        verbose,
      );
      if (matcher.denies !== NO_OP_DENIES) {
        dirRules = [...dirRules, { path: gitignorePath, matcher }];
      }
    } catch (_e) {
      // Check for .gitignore even if not in a .git directory
      const matcher = await loadGitignoreFile(
        gitignorePath,
        gitignoreCache,
        verbose,
      );
      if (matcher.denies !== NO_OP_DENIES) {
        dirRules = [...dirRules, { path: gitignorePath, matcher }];
      }
    }

    try {
      for await (const entry of Deno.readDir(dirPath)) {
        const entryPath = join(dirPath, entry.name);

        // Skip hidden files/directories
        if (entry.name.startsWith(".")) continue;

        if (entry.isDirectory) {
          await traverseDirectory(entryPath, dirRules);
        } else if (entry.isFile) {
          // Check if file is filtered by gitignore rules
          const isIgnored = dirRules.some(({ path, matcher }) => {
            if (matcher.denies(entryPath)) {
              if (verbose) {
                console.log(`${entryPath} is ignored by ${path}`);
              }
              return true;
            }
            return false;
          });

          if (!isIgnored) {
            if (verbose) {
              console.log(`${entryPath} is not ignored`);
            }
            files.push(entryPath);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
  }

  await traverseDirectory(basePath);
  return files;
}

/**
 * Get content from specified paths (multiple possible)
 */
export async function getFilesContent(
  basePaths: string | string[],
  verbose = false,
): Promise<string> {
  const paths = Array.isArray(basePaths) ? basePaths : [basePaths];
  const allFiles: string[] = [];

  // Collect all file paths
  for (const path of paths) {
    try {
      const fileInfo = await Deno.stat(path);

      if (fileInfo.isFile) {
        if (verbose) {
          console.log(`Adding single file: ${path}`);
        }
        allFiles.push(path);
      } else if (fileInfo.isDirectory) {
        if (verbose) {
          console.log(`Processing directory: ${path}`);
        }
        const dirFiles = await getTrackedFiles(path, verbose);
        allFiles.push(...dirFiles);
      }
    } catch (_e) {
      // Try as glob pattern if path doesn't exist directly
      if (verbose) {
        console.log(`Trying as glob pattern: ${path}`);
      }

      try {
        for await (const entry of expandGlob(path)) {
          if (entry.isFile) {
            if (verbose) {
              console.log(`Found file from glob: ${entry.path}`);
            }
            allFiles.push(entry.path);
          }
        }
      } catch (globError) {
        console.error(`Error processing glob pattern ${path}:`, globError);
      }
    }
  }

  if (verbose) {
    console.log(`Found ${allFiles.length} total files to process.`);
  }

  if (allFiles.length === 0) {
    throw new Error("No files found in the specified paths");
  }

  // Read file contents
  const results: string[] = [];
  for (const file of allFiles) {
    try {
      // Skip binary files
      if (await isBinaryFile(file)) {
        if (verbose) {
          console.log(`Skipping binary file: ${file}`);
        }
        continue;
      }

      if (verbose) {
        console.log(`Reading file: ${file}`);
      }
      const content = await Deno.readTextFile(file);
      const escapedContent = JSON.stringify(content);
      results.push(`${file}\t${escapedContent}`);
    } catch (error) {
      console.error(`Error reading file ${file}:`, error);
    }
  }

  if (results.length === 0) {
    throw new Error("No readable files found");
  }

  if (verbose) {
    console.log(`Total readable files: ${results.length}`);
  }

  return results.join("\n");
}
