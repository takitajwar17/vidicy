import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { join } from "path";
import { mkdirSync } from "fs";

export function createDevelopmentLogger() {
  const logDir = join(process.cwd(), "logs");
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {}

  const logLevels = { error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6 };
  const logColors = { error: "red", warn: "yellow", info: "green", http: "magenta", verbose: "grey", debug: "blue", silly: "cyan" };
  winston.addColors(logColors);

  const developmentFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }: any) => {
      const metaStr = Object.keys(meta).length ? `
${JSON.stringify(meta, null, 2)}` : "";
      return `${timestamp} [${level}]: ${message}${stack ? `
${stack}` : ""}${metaStr}`;
    })
  );

  return winston.createLogger({
    levels: logLevels,
    level: "debug",
    format: developmentFormat,
    transports: [
      new winston.transports.Console({ level: "debug" }),
      new DailyRotateFile({
        filename: join(logDir, "app-%DATE%.log"),
        datePattern: "YYYY-MM-DD",
        maxSize: "20m",
        maxFiles: "14d",
      })
    ],
  });
}
