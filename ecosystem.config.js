// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "smart-qr",
      cwd: "C:/inetpub/wwwroot/smart-qr-frontend",
      script: "C:/inetpub/wwwroot/smart-qr-frontend/start-smart-qr.bat",
      exec_interpreter: "none",
      exec_mode: "fork",
      windowsHide: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
