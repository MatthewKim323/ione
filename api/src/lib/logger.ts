import pino, { type LoggerOptions } from "pino";
import { env } from "../env.js";

const opts: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: { service: "ione-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      'req.headers["x-api-key"]',
      "*.api_key",
      "*.apiKey",
      "*.password",
      "*.token",
    ],
    censor: "[redacted]",
  },
};

const transport =
  env.NODE_ENV === "development"
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,service",
          singleLine: false,
        },
      })
    : undefined;

export const logger = transport ? pino(opts, transport) : pino(opts);

/** Child logger with a request id / session id baked in. */
export function child(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
