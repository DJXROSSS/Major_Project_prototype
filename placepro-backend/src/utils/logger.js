"use strict";

function errorDetails(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  };
}

function write(level, event, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.SERVICE_NAME,
    ...context,
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.info(output);
}

const logger = {
  info: (event, context) => write("info", event, context),
  warn: (event, context) => write("warn", event, context),
  error: (event, error, context) => write("error", event, { ...context, error: errorDetails(error) }),
};

module.exports = { logger };
