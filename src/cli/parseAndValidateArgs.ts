import { parseArgs } from "@std/cli/parse-args";
import type { Args } from "../../mod.ts";
import { defaults } from "../config/defaults.ts";

/**
 * Parse and validate command-line arguments.
 * Returns an object containing the necessary parameters.
 */
export function parseAndValidateArgs(): Args {
  const args = parseArgs(Deno.args, {
    string: ["base_path", "model", "api_key", "prompt", "base_url", "b", "m", "a", "p", "u"],
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

  const basePath: string = args.base_path || (args._[0] as string) || Deno.cwd();
  const prompt: string = args.prompt || "";

  let apiKey: string = args.api_key || "";
  if (!apiKey) {
    apiKey = Deno.env.get("GOOGLE_API_KEY") || "";
    if (!apiKey) {
      console.error("GOOGLE_API_KEY environment variable not set");
      Deno.exit(1);
    }
  }

  return {
    basePath,
    apiKey,
    prompt,
    model: args.model || defaults.model,
    baseUrl: args.base_url || defaults.baseUrl,
    stream: args.stream,
    verbose: args.verbose,
  };
}
