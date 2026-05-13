/**
 * PM2 process configuration for production deployment.
 * Use: `pm2 start ecosystem.config.cjs && pm2 save`
 *
 * Logs go to ./logs/ — make sure that directory exists or override paths.
 */
module.exports = {
  apps: [
    {
      name: "techmania-projekty",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: __dirname,
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      kill_timeout: 5000,
    },
  ],
};
