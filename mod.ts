

import * as fileUtils from "./src/file_utils.ts";
import * as googleApi from "./src/google_api.ts";
import { parseAndValidateArgs } from "./src/cli/parseAndValidateArgs.ts";
import { initLogger } from "./src/logger.ts";

export interface Args {
  basePaths: string[];
  apiKey: string;
  prompt: string;
  model: string;
  baseUrl: string;
  stream: boolean;
  verbose: boolean;
}

/**
 * Build a prompt string from file contents and user prompt
 * @param filesContent Aggregated content from files
 * @param prompt User-provided prompt string
 * @returns Constructed prompt string
 */
function buildPrompt(filesContent: string, prompt: string): string {
  return `The following is information read from a list of source codes.

Files:
${filesContent}

Question:
${prompt}

Please answer the question by referencing the specific filenames and source code from the files provided above.`;
}

/**
 * Validate if specified paths exist
 * @param paths Array of paths
 * @param verbose Verbose logging flag
 */
import { log } from "./src/logger.ts";
// Deno依存を外し、呼び出し元で処理する
export async function validatePaths(paths: string[], verbose: boolean): Promise<void> {
  for (const path of paths) {
    // ここでは存在チェックせず、必要なら呼び出し元でDeno APIを使う
    log(`Validate path: ${path}`);
  }
}

/**
 * Send request to API and output results
 * @param apiKey API key
 * @param messages Array of messages
 * @param model Model name
 * @param stream Streaming flag
 * @param baseUrl API base URL
 */
export async function callApiAndOutputResults(
  apiKey: string,
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean,
  baseUrl: string,
  onData: (text: string) => Promise<void> | void,
): Promise<void> {
  try {
    for await (
      const text of googleApi.getGoogleApiData(
        apiKey,
        messages,
        model,
        stream,
        baseUrl,
      )
    ) {
      await onData(text);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error("Error fetching API data: " + errorMessage);
  }
}

/**
 * Get content from files
 * @param basePaths Array of file paths
 * @param verbose Verbose logging flag
 * @returns File content string
 */
export async function getContentFromFiles(
  basePaths: string[],
  verbose: boolean,
): Promise<string> {
  try {
    return await fileUtils.getFilesContent(basePaths, verbose);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get files content: ${errorMessage}`);
  }
}

// CLI用のmainはsrc/main.tsに移動
