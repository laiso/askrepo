#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

import * as fileUtils from "./src/file_utils.ts";
import { getAIResponse } from "./src/vercel_ai_sdk.ts";
import { parseAndValidateArgs } from "./src/cli/parseAndValidateArgs.ts";

export interface Args {
  basePaths: string[];
  apiKey: string;
  prompt: string;
  model: string;
  baseUrl: string;
  provider: string;
  stream: boolean;
  verbose: boolean;
}

/**
 * Build the prompt string using the files' content and instruction.
 * @param filesContent The aggregated content from the files.
 * @param prompt The prompt string provided by the user.
 * @returns The constructed prompt string.
 */
function buildPrompt(filesContent: string, prompt: string): string {
  return `The following is information read from a list of source codes.

Files:
${filesContent}

Question:
${prompt}

Please answer the question by referencing the specific filenames and source code from the files provided above.`;
}

async function main() {
  // Parse and validate command-line arguments
  const { basePaths, apiKey, prompt, model, baseUrl, provider, stream, verbose } =
    parseAndValidateArgs();

  for (const path of basePaths) {
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

  // Retrieve file contents with verbose logging if enabled
  let filesContent: string;
  try {
    filesContent = await fileUtils.getFilesContent(basePaths, verbose);
  } catch (e) {
    console.error(`Failed to get files content: ${e}`);
    return;
  }

  // Build prompt
  const finalPrompt = buildPrompt(filesContent, prompt);
  const messages = [
    { role: "user", content: finalPrompt },
  ];

  try {
    for await (const text of getAIResponse(apiKey, messages, model, stream, baseUrl)) {
      await Deno.stdout.write(new TextEncoder().encode(text));
    }
  } catch (e) {
    console.error("Error fetching AI API data: ", e);
  }
}

if (import.meta.main) {
  await main();
}
