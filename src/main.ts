#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

import { parseAndValidateArgs } from "./cli/parseAndValidateArgs.ts";
import { initLogger } from "./logger.ts";
import { validatePaths, getContentFromFiles, callApiAndOutputResults } from "../mod.ts";

async function main() {
  try {
    const { basePaths, apiKey, prompt, model, baseUrl, stream, verbose } = parseAndValidateArgs();
    initLogger(verbose);
    await validatePaths(basePaths, verbose);
    const filesContent = await getContentFromFiles(basePaths, verbose);
    const finalPrompt = `The following is information read from a list of source codes.\n\nFiles:\n${filesContent}\n\nQuestion:\n${prompt}\n\nPlease answer the question by referencing the specific filenames and source code from the files provided above.`;
    const messages = [ { role: "user", content: finalPrompt } ];
    await callApiAndOutputResults(apiKey, messages, model, stream, baseUrl, async (text) => {
      await Deno.stdout.write(new TextEncoder().encode(text));
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
