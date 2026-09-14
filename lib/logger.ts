import "server-only";

/**
 * 统一日志出口（架构评审 P2-4）。
 *
 * 为什么需要它：日志调用原先散落在 `lib/errors.ts`、`lib/ai.ts`、`error.tsx` 等处，
 * 各自直接 `console.error(...)`，格式与字段各不相同。后果有两个：
 * 1. 想统一成结构化 JSON（`observability.md` 的目标契约）时必须逐个文件改，必然会漏；
 * 2. 纯函数里混入 `console` 副作用后，它的行为不再只由入参决定，测试与复用都更别扭。
 *
 * 这里把「写日志」收敛成一个出口，并把底层实现做成可替换的 sink：
 * 需要 JSON 输出时只改 `consoleSink` 一处（或注入一个 `LogSink`），调用方不动。
 *
 * 注意：本模块不做字段脱敏。禁止把密码、API Key、Session Token、数据库连接串
 * 或未经脱敏的用户输入作为 detail 传入（见 `observability.md` §3）。
 */

export type LogLevel = "error" | "warn" | "info";

export type LogSink = (level: LogLevel, message: string, detail?: unknown) => void;

const consoleSink: LogSink = (level, message, detail) => {
  const args: unknown[] = detail === undefined ? [message] : [message, detail];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
};

let sink: LogSink = consoleSink;

/**
 * 替换日志出口。传 null 恢复默认的 console 实现。
 * 生产换结构化日志、测试里静音或断言，都走这一个入口。
 */
export function setLogSink(next: LogSink | null): void {
  sink = next ?? consoleSink;
}

export function logError(message: string, detail?: unknown): void {
  sink("error", message, detail);
}

export function logWarn(message: string, detail?: unknown): void {
  sink("warn", message, detail);
}

export function logInfo(message: string, detail?: unknown): void {
  sink("info", message, detail);
}
