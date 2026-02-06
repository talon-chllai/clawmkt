module.exports = {
  apps: [{
    name: 'pinchmarket',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: 'C:\\Users\\Administrator\\projects\\clawmkt',
    env: {
      PORT: 3003,
      NODE_ENV: 'production'
    },
    watch: false,
    autorestart: true,
    max_restarts: 10
  }]
};
