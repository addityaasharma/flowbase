// pm2 process definitions for the VPS (/var/www/bitcode-tracker). Ports are private: nginx is the only public entry.
const root = "/var/www/bitcode-tracker";
module.exports = {
  apps: [
    { name: "tracker-api", cwd: `${root}/apps/api`, script: "dist/index.js", env: { NODE_ENV: "production" }, max_memory_restart: "400M" },
    {
      name: "tracker-web", cwd: `${root}/apps/web`, script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3050", env: { NODE_ENV: "production" }, max_memory_restart: "700M",
    },
  ],
};
