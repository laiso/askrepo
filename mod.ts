#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

import * as fileUtils from "./src/file_utils.ts";
import * as googleApi from "./src/google_api.ts";
import { parseAndValidateArgs } from "./src/cli/parseAndValidateArgs.ts";

/**
 * Defines the shape of the command-line arguments after parsing.
 */
export interface Args {
  /** An array of base paths (files, directories, or glob patterns) from which to read files. */
  basePaths: string[];
  /** The API key for accessing the Google API. */
  apiKey: string;
  /** The user-provided prompt to be answered based on the content of the files. */
  prompt: string;
  /** The model to be used for the Google API request. */
  model: string;
  /** The base URL for the Google API. */
  baseUrl: string;
  /** A boolean flag indicating whether to use streaming for the API response. */
  stream: boolean;
  /** A boolean flag to enable verbose logging for debugging purposes. */
  verbose: boolean;
}

/**
 * Constructs a detailed prompt string to be sent to the Google API.
 * The prompt includes the content of specified files and a user-provided question.
 *
 * @param filesContent A string containing the aggregated and formatted content of the source files.
 *                     Each file's content is expected to be prefixed by its path.
 * @param prompt The user-provided question or instruction.
 * @returns A formatted string that serves as the complete prompt for the API.
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
 * Sends a request to the Google API with the provided messages and parameters,
 * and streams the response to Deno.stdout.
 * Errors during the API call will propagate up from `googleApi.getGoogleApiData`.
 *
 * @param apiKey The API key for the Google API.
 * @param messages An array of message objects to be sent to the API.
 *                 Each object should have `role` and `content` properties.
 * @param model The specific model to use for the API request (e.g., "gemini-pro").
 * @param stream A boolean indicating whether to stream the response or get it in one go.
 * @param baseUrl The base URL for the Google API endpoint.
 * @returns A promise that resolves when the API response has been fully processed and written to stdout.
 */
async function callApiAndOutputResults(
  apiKey: string,
  messages: Array<{ role: string; content: string }>, // More specific type
  model: string,
  stream: boolean,
  baseUrl: string,
): Promise<void> {
  // Errors from getGoogleApiData will propagate up to be caught by main
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
}

/**
 * Retrieves and formats content from specified files or directories using `fileUtils.getFilesContent`.
 * This function acts as a wrapper, allowing errors from `fileUtils.getFilesContent`
 * (e.g., path validation, file reading issues) to propagate upwards.
 *
 * @param basePaths An array of strings, where each string can be a file path, a directory path, or a glob pattern.
 * @param verbose A boolean flag to enable detailed logging during file processing.
 * @returns A promise that resolves to a single string containing the aggregated and formatted content of all readable files.
 * @throws Will re-throw errors from `fileUtils.getFilesContent` if issues occur during path validation or file processing.
 */
async function getContentFromFiles(
  basePaths: string[],
  verbose: boolean,
): Promise<string> {
  // fileUtils.getFilesContent now handles its own path validation and error throwing
  return await fileUtils.getFilesContent(basePaths, verbose);
}

/**
 * Main entry point for the CLI application.
 * It parses arguments, fetches file contents, builds a prompt,
 * calls the Google API, and outputs the results.
 * Errors are caught and printed to stderr, followed by program termination with exit code 1.
 */
async function main() {
  try {
    // Parse and validate arguments
    const { basePaths, apiKey, prompt, model, baseUrl, stream, verbose } =
      parseAndValidateArgs();

    // Get file contents (path validation is now part of this step)
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
