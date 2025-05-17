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
 * プロンプト文字列を構築する
 * @param filesContent ファイルの集約された内容
 * @param prompt ユーザーが提供したプロンプト文字列
 * @returns 構築されたプロンプト文字列
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
 * 指定されたパスが有効かどうかを確認する
 * @param paths パスの配列
 * @param verbose 詳細ログ出力フラグ
 */
async function validatePaths(paths: string[], verbose: boolean): Promise<void> {
  for (const path of paths) {
    try {
      await Deno.stat(path);
    } catch (_e) {
      if (verbose) {
        console.log(
          `Path not found directly: ${path}, will try as glob pattern`
        );
      }
    }
  }
}

/**
 * APIにリクエストを送信し、結果を出力する
 * @param apiKey API キー
 * @param messages メッセージの配列
 * @param model モデル名
 * @param stream ストリーミングフラグ
 * @param baseUrl API の基本URL
 */
async function callApiAndOutputResults(
  apiKey: string,
  messages: { role: string; content: string }[],
  model: string,
  stream: boolean,
  baseUrl: string
): Promise<void> {
  try {
    for await (
      const text of googleApi.getGoogleApiData(
        apiKey,
        messages,
        model,
        stream,
        baseUrl
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
 * ファイル内容を取得する
 * @param basePaths ファイルパスの配列
 * @param verbose 詳細ログ出力フラグ
 * @returns ファイル内容の文字列
 */
async function getContentFromFiles(
  basePaths: string[],
  verbose: boolean
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
    // 引数の解析と検証
    const { basePaths, apiKey, prompt, model, baseUrl, stream, verbose } =
      parseAndValidateArgs();

    // パスの検証
    await validatePaths(basePaths, verbose);

    // ファイル内容の取得
    const filesContent = await getContentFromFiles(basePaths, verbose);
    
    // プロンプトの構築
    const finalPrompt = buildPrompt(filesContent, prompt);
    const messages = [
      { role: "user", content: finalPrompt },
    ];

    // APIを呼び出して結果を出力
    await callApiAndOutputResults(apiKey, messages, model, stream, baseUrl);
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
