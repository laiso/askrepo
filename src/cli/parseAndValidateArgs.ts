import { parseArgs } from "@std/cli/parse-args";
import type { Args } from "../../mod.ts";
import { defaults } from "../config/defaults.ts";

/**
 * 環境変数からAPIキーを取得する
 * @returns APIキー
 * @throws APIキーが設定されていない場合はエラー
 */
function getApiKeyFromEnv(): string {
  const apiKey = Deno.env.get("GOOGLE_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Google API Key not found. Please set GOOGLE_API_KEY environment variable or provide --api_key option"
    );
  }
  return apiKey;
}

/**
 * コマンドライン引数を解析し、必要なパラメータを検証して返す
 * @returns 検証済みの引数オブジェクト
 * @throws 必須パラメータが不足している場合はエラー
 */
export function parseAndValidateArgs(): Args {
  // 引数を解析
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
      "u"
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

  // ベースパスを決定
  let basePaths: string[] = [];
  if (args.base_path) {
    // コマンドラインオプションとして指定された場合
    basePaths = Array.isArray(args.base_path)
      ? args.base_path
      : [args.base_path];
  } else if (args._.length > 0) {
    // 位置引数として指定された場合
    basePaths = args._.map((arg) => String(arg));
  } else {
    // デフォルトは現在のディレクトリ
    basePaths = [Deno.cwd()];
  }

  // プロンプトの設定
  const prompt = args.prompt || defaults.prompt;

  // APIキーの取得
  let apiKey = args.api_key || "";
  if (!apiKey) {
    try {
      apiKey = getApiKeyFromEnv();
    } catch (error: unknown) {
      console.error(error instanceof Error ? error.message : String(error));
      Deno.exit(1);
    }
  }

  // 検証済みの引数を返す
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
