module.exports = {
  apps: [
    {
      name: "versi-ringan",
      script: "./dist/index.js",
      exec_mode: "fork",
      cron_restart: "0 * * * *",
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
