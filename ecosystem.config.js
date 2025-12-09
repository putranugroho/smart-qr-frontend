// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "smart-qr",
      cwd: "C:/inetpub/wwwroot/smart-qr-frontend",
      script: "start-smart-qr.bat",
      interpreter: "none",
      exec_mode: "fork",
      windowsHide: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
