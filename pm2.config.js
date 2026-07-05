module.exports = {
  apps: [
    {
      name: 'at9-scheduler',
      script: '/opt/at9/scheduler/src/index.js',
      env_file: '/opt/at9/scheduler/.env',
      // Single combined log file so Alloy has one tail to follow. PM2
      // would normally split stdout / stderr — pointing both at the
      // same path keeps everything in /opt/at9/logs/at9-scheduler.log.
      out_file: '/opt/at9/logs/at9-scheduler.log',
      error_file: '/opt/at9/logs/at9-scheduler.log',
      merge_logs: true,
      // PM2's own date prefix is omitted on purpose — every line is a
      // self-contained JSON record from src/logger.js with its own `ts`
      // field. A textual prefix would corrupt the JSON and break Alloy's
      // parser stage.
      log_type: 'raw',
    },
  ],
};
