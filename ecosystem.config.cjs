module.exports = {
  apps: [
    {
      name: "nipaplay-next",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3010",
      env: {
        NODE_ENV: "production",
        PORT: "3010",
        NIPAPLAY_DATA_ROOT: process.env.NIPAPLAY_DATA_ROOT || "/www/nipaplay-data",
        MUSIC_LIBRARY_CODE: process.env.MUSIC_LIBRARY_CODE || "irigas",
        MUSIC_LIBRARY_ROOT: process.env.MUSIC_LIBRARY_ROOT || "/www/nipaplay-data/music_library_data",
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
        AUTH_SECRET: process.env.AUTH_SECRET
      }
    }
  ]
};
