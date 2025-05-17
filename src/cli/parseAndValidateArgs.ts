import { parseArgs } from "@std/cli/parse-args";
import type { Args } from "../../mod.ts";
import { defaults } from "../config/defaults.ts";

/**
 * Get API key from environment variable
 * @returns API key
 * @throws Error if API key is not set
 */
function getApiKeyFromEnv(): string {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Google API Key not found. Please set GOOGLE_API_KEY environment variable or provide --api_key option",
    );
  }
  return apiKey;
}

/**
 * Parse and validate command-line arguments
 * @returns Validated arguments object
 * @throws Error if required parameters are missing
 */
export function parseAndValidateArgs(): Args {
  // Parse arguments
  const args = parseArgs(Deno.args, {
    string: [
      "base_path",
      "model",
      "api_key",
      "prompt",
      "base_url",
      "b",
      "m",
      "a",
      "p",
      "u",
    ],
    boolean: ["stream", "verbose", "s", "v"],
    alias: {
      b: "base_path",
      m: "model",
      a: "api_key",
      p: "prompt",
      u: "base_url",
      s: "stream",
      v: "verbose",
    },
    default: {
      model: defaults.model,
      prompt: defaults.prompt,
      base_url: defaults.baseUrl,
      stream: defaults.stream,
      verbose: defaults.verbose,
    },
  });

  // Determine base paths
  let basePaths: string[] = [];
  if (args.base_path) {
    // Specified as command-line option
    basePaths = Array.isArray(args.base_path)
      ? args.base_path
      : [args.base_path];
  } else if (args._.length > 0) {
    // Specified as positional arguments
    basePaths = args._.map((arg) => String(arg));
  } else {
    // Default to current directory
    basePaths = [Deno.cwd()];
  }

  // Set prompt
  const prompt = args.prompt || defaults.prompt;

  // Get API key
  let apiKey = args.api_key || "";
  if (!apiKey) {
    try {
      apiKey = getApiKeyFromEnv();
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  }

  // Return validated arguments
  return {
    basePaths,
    apiKey,
    prompt,
    model: args.model || defaults.model,
    baseUrl: args.base_url || defaults.baseUrl,
    stream: args.stream,
    verbose: args.verbose,
  };
}
