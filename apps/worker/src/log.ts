type Level = "info" | "warn" | "error";

function write(level: Level, message: string, data?: Record<string, unknown>): void {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, data?: Record<string, unknown>) => write("info", message, data),
  warn: (message: string, data?: Record<string, unknown>) => write("warn", message, data),
  error: (message: string, data?: Record<string, unknown>) => write("error", message, data),
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.message}${cause}`;
  }
  return String(error);
}
