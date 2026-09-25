/**
 * PM2 process file for the Log API (production, VPS).
 *
 * One-time VPS setup ends with:
 *   pm2 start ecosystem.config.js --env production
 *
 * Every CI deploy then just runs:
 *   pm2 reload ecosystem.config.js --env production
 *
 * `.env` on the VPS supplies secrets (DATABASE_URL, CLERK_SECRET_KEY,
 * OPENAI_API_KEY, PORT). Nothing secret is committed here — see
 * `.env.example` and `deployment.md`.
 */
module.exports = {
  apps: [
    {
      name: "param-api",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
