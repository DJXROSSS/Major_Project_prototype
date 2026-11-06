type Context = Record<string, unknown>;

function write(level: "warn" | "error", event: string, context: Context = {}) {
  const entry = { timestamp: new Date().toISOString(), level, event, ...context };
  if (level === "error") console.error(entry);
  else console.warn(entry);
}

export const logger = {
  warn: (event: string, context?: Context) => write("warn", event, context),
  error: (event: string, error: unknown, context?: Context) => write("error", event, {
    ...context,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
  }),
};
