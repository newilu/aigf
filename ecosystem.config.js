// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "telegram-bot",
      script: "./dist/index.js",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
