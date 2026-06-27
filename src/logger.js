'use strict';

const { log } = require('./config');

// Tiny structured logger — keeps output greppable in production logs
// without pulling in a logging dep. Each call serialises to a single
// JSON line: { ts, level, msg, ...meta }.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[log.level] ?? LEVELS.info;

const emit = (level, msg, meta) => {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  });
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

module.exports = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};
