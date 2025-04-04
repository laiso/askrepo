import { join } from "jsr:@std/path@1";
import { compile } from "jsr:@cfa/gitignore-parser@0.1.4";

const MAX_SCAN_SIZE = 1024;
const NO_OP_DENIES = (_path: string) => false;

const MAGIC_NUMBERS: Uint8Array[] = [
  new Uint8Array([0xFF, 0xD8, 0xFF]), // JPEG
  new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG
  new TextEncoder().encode("GIF87a"), // GIF
  new TextEncoder().encode("GIF89a"), // GIF
];

const MAX_MAGIC_NUMBER_LENGTH = Math.max(...MAGIC_NUMBERS.map(arr => arr.length));

export function isBinaryFileByExtension(file: string): boolean {
  const binaryExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "exe", "dll"];
  const parts = file.split(".");
  if (parts.length === 0) return false;
  const ext = parts[parts.length - 1].toLowerCase();
  return binaryExtensions.includes(ext);
}

export async function isBinaryFileByContent(file: string): Promise<boolean> {
  try {
    const file_obj = await Deno.open(file, { read: true });
    try {
      const bytesToRead = Math.max(MAX_SCAN_SIZE, MAX_MAGIC_NUMBER_LENGTH);
      const buffer = new Uint8Array(bytesToRead);
      const bytesRead = await file_obj.read(buffer);
      
      if (bytesRead === null) return false;
      
      const data = buffer.subarray(0, bytesRead);
      
      for (let i = 0; i < data.length && i < MAX_SCAN_SIZE; i++) {
        if (data[i] === 0) return true;
      }
      
      for (const magic of MAGIC_NUMBERS) {
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
  } catch (_e) {
    console.error(`Error reading file for binary check ${file}:`, _e);
    throw new Error(`Failed to check if file is binary`);
  }
}

export async function isBinaryFile(file: string): Promise<boolean> {
  return isBinaryFileByExtension(file) || (await isBinaryFileByContent(file));
}

export async function getTrackedFiles(basePath: string, verbose = false): Promise<string[]> {
  if (verbose) {
    console.log(`${basePath} is the base path`);
  }
  
  const files: string[] = [];
  const gitignoreCache = new Map<string, { denies: (path: string) => boolean }>();
  
  async function loadGitignoreFile(
    gitignorePath: string, 
    dirRules: Array<{ path: string, matcher: { denies: (path: string) => boolean } }>
  ): Promise<Array<{ path: string, matcher: { denies: (path: string) => boolean } }>> {
    if (!gitignoreCache.has(gitignorePath)) {
      try {
        const gitignoreContent = await Deno.readTextFile(gitignorePath);
        const matcher = compile(gitignoreContent);
        gitignoreCache.set(gitignorePath, matcher);
        dirRules.push({ path: gitignorePath, matcher });
        if (verbose) {
          console.log(`Loaded .gitignore from ${gitignorePath}`);
        }
      } catch (_e) {
        if (verbose) {
          console.log(`No .gitignore found at ${gitignorePath}`);
        }
        gitignoreCache.set(gitignorePath, { denies: NO_OP_DENIES });
      }
    } else if (gitignoreCache.get(gitignorePath)!.denies !== NO_OP_DENIES) {
      dirRules.push({ path: gitignorePath, matcher: gitignoreCache.get(gitignorePath)! });
    }
    return dirRules;
  }
  
  async function traverseDirectory(
    dirPath: string, 
    currentRules: Array<{ path: string, matcher: { denies: (path: string) => boolean } }> = []
  ): Promise<void> {
    const gitignorePath = join(dirPath, ".gitignore");
    let dirRules = [...currentRules];
    
    try {
      const gitDirPath = join(dirPath, ".git");
      const gitDirStat = await Deno.stat(gitDirPath);
      if (gitDirStat.isDirectory) {
        if (verbose) {
          console.log(`Found Git repository root at ${dirPath}`);
        }
        dirRules = await loadGitignoreFile(gitignorePath, dirRules);
      }
    } catch (_e) {
      dirRules = await loadGitignoreFile(gitignorePath, dirRules);
    }
    
    try {
      for await (const entry of Deno.readDir(dirPath)) {
        const entryPath = join(dirPath, entry.name);
        
        if (entry.name.startsWith(".")) continue;
              
        if (entry.isDirectory) {
          await traverseDirectory(entryPath, dirRules);
        } else {
          let isIgnored = false;
          for (const { path, matcher } of dirRules) {
            if (matcher.denies(entryPath)) {
              if (verbose) {
                console.log(`${entryPath} is ignored by ${path}`);
              }
              isIgnored = true;
              break;
            }
          }
          
          if (!isIgnored) {
            if (verbose) {
              console.log(`${entryPath} is not ignored`);
            }
            files.push(entryPath);
          }
        }
      }
    } catch (e) {
      console.error(`Error reading directory ${dirPath}:`, e);
    }
  }
  
  await traverseDirectory(basePath);
  return files;
}

export async function getFilesContent(basePath: string, verbose = false): Promise<string> {
  const files = await getTrackedFiles(basePath, verbose);
  if (verbose) {
    console.log(`Found ${files.length} tracked files.`);
  }
  const results: string[] = [];
  for (const file of files) {
    const isBin = await isBinaryFile(file);
    if (isBin) {
      if (verbose) {
        console.log(`Skipping binary file: ${file}`);
      }
      continue;
    }
    try {
      if (verbose) {
        console.log(`Reading file: ${file}`);
      }
      const content = await Deno.readTextFile(file);
      const escapedContent = JSON.stringify(content);
      results.push(`${file}\t${escapedContent}`);
    } catch (err) {
      console.error(`Error reading file ${file}:`, err);
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
