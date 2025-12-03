module.exports = {
  apps: [
    {
      name: "smart-qr",
      cwd: "C:/inetpub/wwwroot/smart-qr-frontend",
      script: "cmd.exe",
      args: "/c npm start",
      interpreter: null,
      windowsHide: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
