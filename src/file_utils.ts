import { join } from "jsr:@std/path@1";
import { compile } from "jsr:@cfa/gitignore-parser@0.1.4";
import { expandGlob } from "jsr:@std/fs@1";

/** Maximum number of bytes to read from a file to determine if it's binary by content. */
const MAX_SCAN_SIZE = 1024;
/** A no-operation function for gitignore matching, used when a .gitignore file is not found or is empty. */
const NO_OP_DENIES = (_path: string) => false;

/**
 * A record mapping common binary file types to their magic numbers (byte signatures).
 * Used for content-based binary file detection.
 */
const MAGIC_NUMBERS: Record<string, Uint8Array> = {
  JPEG: new Uint8Array([0xFF, 0xD8, 0xFF]),
  PNG: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  GIF87: new TextEncoder().encode("GIF87a"),
  GIF89: new TextEncoder().encode("GIF89a"),
  BMP: new Uint8Array([0x42, 0x4D]),
};

/** The length of the longest magic number sequence in `MAGIC_NUMBERS`. Used to optimize buffer reading. */
const MAX_MAGIC_NUMBER_LENGTH = Math.max(
  ...Object.values(MAGIC_NUMBERS).map((arr) => arr.length),
);

/** A set of common binary file extensions used for quick binary file detection. */
const BINARY_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "bmp",
  "exe",
  "dll",
  // Add other common binary extensions as needed
]);

/**
 * Synchronously determines if a file is likely binary based solely on its extension.
 *
 * @param file The path to the file.
 * @returns True if the file extension is in the `BINARY_EXTENSIONS` set, false otherwise.
 */
export function isBinaryFileByExtension(file: string): boolean {
  const parts = file.split(".");
  if (parts.length === 0) return false;
  const ext = parts[parts.length - 1].toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Asynchronously determines if a file is binary by examining its initial content.
 * It checks for the presence of NULL bytes or matches against known magic numbers
 * within the first `MAX_SCAN_SIZE` bytes or `MAX_MAGIC_NUMBER_LENGTH` bytes (whichever is larger).
 *
 * @param file The path to the file.
 * @returns A promise that resolves to true if the file content suggests it's binary, false otherwise.
 * @throws An error if the file cannot be opened or read.
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
    // Re-throw with a more specific message, preserving original error info if possible
    throw new Error(
      `Failed to check if file "${file}" is binary by content: ${errorMessage}`,
    );
  }
}

/**
 * Asynchronously determines if a file is binary by first checking its extension,
 * and if that's inconclusive, by examining its content.
 *
 * @param file The path to the file.
 * @returns A promise that resolves to true if the file is considered binary, false otherwise.
 */
export async function isBinaryFile(file: string): Promise<boolean> {
  return isBinaryFileByExtension(file) || (await isBinaryFileByContent(file));
}

/**
 * Loads and compiles gitignore rules from a specified .gitignore file.
 * Results are cached in `gitignoreCache` to avoid redundant file reads and compilations.
 * If a .gitignore file is not found or is unreadable, a no-operation matcher is cached and returned.
 *
 * @param gitignorePath The path to the .gitignore file.
 * @param gitignoreCache A map used to cache compiled gitignore matchers.
 *                       The key is the path to the .gitignore file, and the value is the compiled matcher.
 * @param verbose If true, logs information about loading .gitignore files.
 * @returns A promise that resolves to a gitignore matcher object with a `denies` method.
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
 * Traverses a directory recursively to get a list of files,
 * respecting .gitignore rules found in the specified directory and its subdirectories.
 * Hidden files and directories (those starting with a dot) are skipped.
 *
 * @param basePath The root directory path from which to start traversal.
 * @param verbose If true, logs detailed information about directory traversal and gitignore rule application.
 * @returns A promise that resolves to an array of file path strings that are not ignored.
 */
export async function getTrackedFiles(
  basePath: string,
  verbose = false,
): Promise<string[]> {
  if (verbose) {
    console.log(`Starting directory traversal from base path: ${basePath}`);
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
 * Resolves a list of base paths—which can be files, directories, or glob patterns—
 * into a flat list of unique, absolute file paths. This function handles .gitignore rules
 * when traversing directories and ensures that all specified paths are valid and lead to actual files.
 *
 * @param basePaths A single path string or an array of path strings. Each string can be a
 *                  direct file path, a directory path, or a glob pattern.
 * @param verbose If true, logs detailed information about the path resolution process,
 *                including which files are added, which directories are processed, and how globs are expanded.
 * @returns A promise that resolves to an array of unique, absolute file path strings.
 * @throws An error if any provided path string is invalid (e.g., does not exist and is not a valid glob
 *         that matches any files), or if no files are ultimately found after processing all base paths.
 */
async function resolveFilePaths(
  basePaths: string | string[],
  verbose = false,
): Promise<string[]> {
  const paths = Array.isArray(basePaths) ? basePaths : [basePaths];
  const allFiles: string[] = [];
  let atLeastOnePathProcessedSuccessfully = false;

  for (const path of paths) {
    let currentPathFoundFiles = false;
    try {
      const fileInfo = await Deno.stat(path);
      currentPathFoundFiles = true; // Path exists as a file or directory

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
        if (dirFiles.length > 0) {
          allFiles.push(...dirFiles);
        } else if (verbose) {
          console.log(`No tracked files found in directory: ${path}`);
        }
      }
    } catch (_e) {
      // Try as glob pattern if path doesn't exist directly
      if (verbose) {
        console.log(
          `Path not found directly: ${path}, attempting glob pattern.`,
        );
      }
      try {
        let globMatchedAnyFile = false;
        for await (const entry of expandGlob(path)) {
          if (entry.isFile) {
            if (verbose) {
              console.log(`Found file from glob ${path}: ${entry.path}`);
            }
            allFiles.push(entry.path);
            globMatchedAnyFile = true;
          }
        }
        if (globMatchedAnyFile) {
          currentPathFoundFiles = true; // Glob pattern resolved to at least one file
        } else if (verbose) {
          console.log(`Glob pattern ${path} did not match any files.`);
        }
      } catch (globError) {
        // Log glob error but don't throw here; the check below will handle it.
        console.error(`Error processing glob pattern ${path}:`, globError);
      }
    }

    if (currentPathFoundFiles) {
      atLeastOnePathProcessedSuccessfully = true;
    } else {
      // If after trying stat and glob, nothing was found for this specific path entry.
      throw new Error(
        `Invalid path, or no files found for: "${path}". Please ensure the path exists, is accessible, and matches files if it's a glob.`,
      );
    }
  }

  if (verbose) {
    console.log(`Collected ${allFiles.length} potential file(s) to process.`);
  }

  const uniqueFiles = [...new Set(allFiles)];

  if (verbose) {
    console.log(
      `Found ${uniqueFiles.length} unique file(s) to process.`,
    );
  }

  if (uniqueFiles.length === 0) {
    if (!atLeastOnePathProcessedSuccessfully && paths.length > 0) {
      // This should ideally be caught by the per-path check above.
      // This is a safeguard if, for some reason, paths were processed but allFiles remained empty.
      throw new Error(
        `No files found for the specified paths: ${paths.join(
          ", ",
        )}. Please check the paths.`,
      );
    }
    // If atLeastOnePathProcessedSuccessfully was true, but uniqueFiles is empty (e.g. directory found but no files inside)
    // This specific message is now more targeted in readAndFormatFileContents if no *readable* files are found.
    // Here, it means no files (even potentially binary/unreadable) were collected.
    throw new Error(
      "No files found in the specified paths after processing all inputs.",
    );
  }
  return uniqueFiles;
}

/**
 * Reads the content of each file in the provided list, filters out binary files,
 * and formats the content of readable text files into a single string.
 * Each file's content is prefixed by its path and tab-separated, then JSON stringified.
 *
 * @param filePaths An array of absolute file path strings, typically the output of `resolveFilePaths`.
 * @param verbose If true, logs detailed information about which files are being read,
 *                which are skipped as binary, and any errors encountered during file reading.
 * @returns A promise that resolves to a single string. This string contains the formatted content of all
 *          readable files, with each file's entry joined by a newline character.
 *          The format for each entry is: `filepath\t"JSON_stringified_content"`.
 * @throws An error if no readable (non-binary, non-ignored) files are found after processing all
 *         provided file paths. This can happen if all files are binary, unreadable due to permissions,
 *         or if the `filePaths` array is empty.
 */
async function readAndFormatFileContents(
  filePaths: string[],
  verbose = false,
): Promise<string> {
  const results: string[] = [];
  if (verbose) {
    console.log(`Reading content for ${filePaths.length} file(s).`);
  }

  for (const file of filePaths) {
    try {
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
      // Log error and continue with other files.
      // The overall function will throw if results remains empty.
      console.error(`Error reading file ${file}:`, error);
    }
  }

  if (results.length === 0) {
    throw new Error(
      "No readable (non-binary, non-ignored) files found after processing the provided paths.",
    );
  }

  if (verbose) {
    console.log(`Successfully read and formatted ${results.length} file(s).`);
  }

  return results.join("\n");
}

/**
/**
 * Orchestrates the two-step process of first resolving a set of base paths (which can include
 * files, directories, and glob patterns) into a list of specific, unique file paths, and then
 * reading and formatting the content of these files.
 *
 * This function is the primary entry point for obtaining file content for the application.
 *
 * @param basePaths A single path string or an array of path strings. These can be direct paths
 *                  to files, paths to directories (which will be traversed respecting .gitignore),
 *                  or glob patterns.
 * @param verbose If true, enables detailed logging for both the path resolution and file reading stages.
 * @returns A promise that resolves to a single string. This string contains the aggregated and
 *          formatted content of all readable files found from the `basePaths`.
 *          Each file's content is prefixed by its path, tab-separated, and JSON stringified,
 *          with entries for different files joined by newlines.
 * @throws An error if path resolution fails (e.g., invalid paths, no files found for a glob)
 *         or if no readable files are found from the resolved paths.
 */
export async function getFilesContent(
  basePaths: string | string[],
  verbose = false,
): Promise<string> {
  const resolvedFilePaths = await resolveFilePaths(basePaths, verbose);
  return await readAndFormatFileContents(resolvedFilePaths, verbose);
}
