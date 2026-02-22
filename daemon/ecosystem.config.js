module.exports = {
  apps: [
    {
      name: 'claude-code-remote',
      script: 'src/index.js',
      exec_mode: 'fork', // node-pty requires main thread
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
