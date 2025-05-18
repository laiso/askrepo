#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

import * as fileUtils from "./src/file_utils.ts";
import * as googleApi from "./src/google_api.ts";
import { parseAndValidateArgs } from "./src/cli/parseAndValidateArgs.ts";

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
async function validatePaths(paths: string[], verbose: boolean): Promise<void> {
  for (const path of paths) {
    try {
      await Deno.stat(path);
    } catch (_e) {
      if (verbose) {
        console.log(
          `Path not found directly: ${path}, will try as glob pattern`,
        );
      }
    }
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
async function callApiAndOutputResults(
  apiKey: string,
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean,
  baseUrl: string,
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
      await Deno.stdout.write(new TextEncoder().encode(text));
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error fetching API data: ", errorMessage);
  }
}

/**
 * Get content from files
 * @param basePaths Array of file paths
 * @param verbose Verbose logging flag
 * @returns File content string
 */
async function getContentFromFiles(
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

async function main() {
  try {
    // Parse and validate arguments
    const { basePaths, apiKey, prompt, model, baseUrl, stream, verbose } =
      parseAndValidateArgs();

    // Validate paths
    await validatePaths(basePaths, verbose);

    // Get file contents
    const filesContent = await getContentFromFiles(basePaths, verbose);

    // Build prompt
    const finalPrompt = buildPrompt(filesContent, prompt);
    const messages = [
      { role: "user", content: finalPrompt },
    ];

    // Call API and output results
    await callApiAndOutputResults(apiKey, messages, model, stream, baseUrl);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
