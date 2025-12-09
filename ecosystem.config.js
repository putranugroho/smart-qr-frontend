// ecosystem.config.js - SOLUSI
module.exports = {
  apps: [
    {
      name: "smart-qr",
      cwd: "C:/inetpub/wwwroot/smart-qr-frontend",
      script: "cmd.exe",
      args: ["/c", "start-smart-qr.bat"], 
      interpreter: "none",
      exec_mode: "fork",
      windowsHide: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};