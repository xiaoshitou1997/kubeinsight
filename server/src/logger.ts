type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
let threshold: Level = 'info';

export function setLogLevel(level: Level): void {
  threshold = level;
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const time = new Date().toISOString().slice(11, 19);
  let line = `${time} ${level.toUpperCase().padEnd(5)} ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    const extra = Object.entries(meta)
      .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' ');
    line += `  ${extra}`;
  }
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

export const log = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
