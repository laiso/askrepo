// 型定義ファイル: Deno, import.meta.main の型拡張
// Denoグローバルの型を宣言
// （Deno実行環境であれば自動で型が入るが、型エラー回避用）
declare const Deno: typeof import("deno").Deno;

// import.meta.main の型拡張（Deno v1.34+）
interface ImportMeta {
  main?: boolean;
}
