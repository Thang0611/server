/**
 * PM2 Ecosystem Configuration
 * Manages all production services: Node.js Backend, Next.js Frontend, and Python Redis Workers
 * 
 * Usage:
 *   - Start all: pm2 start ecosystem.config.js
 *   - Stop all: pm2 stop ecosystem.config.js
 *   - Restart all: pm2 restart ecosystem.config.js
 *   - Delete all: pm2 delete ecosystem.config.js
 * 
 * Individual control:
 *   - pm2 restart api
 *   - pm2 restart nextjs
 *   - pm2 restart workers
 */

module.exports = {
  apps: [
    // ==================== NODE.JS BACKEND API ====================
    {
      name: 'api',
      script: './server.js',
      instances: 2,  // Run 2 instances for load balancing (or use 'max' for all CPU cores)
      exec_mode: 'cluster',  // Node.js cluster mode for load balancing
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Environment variables from .env file
      env_file: './.env',
      
      // Advanced configurations
      max_memory_restart: '500M',  // Restart if memory exceeds 500MB
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      
      // Watch (disable in production for performance)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'Staging_Download']
    },

    // ==================== NEXT.JS FRONTEND ====================
    {
      name: 'nextjs',
      script: 'npm',
      args: 'start',
      cwd: '/root/project/clone-app',  // Next.js application directory
      instances: 1,  // Next.js usually runs as single instance (or 'max' for SSR apps)
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001  // Adjust port as needed
      },
      
      // Logs
      error_file: '/root/project/server/logs/nextjs-error.log',
      out_file: '/root/project/server/logs/nextjs-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart
      autorestart: true,
      max_memory_restart: '800M',
      
      watch: false
    },

    // ==================== PYTHON REDIS WORKERS ====================
    {
      name: 'workers',
      script: 'worker_rq.py',  // Script name only (cwd is udemy_dl)
      interpreter: 'python3',  // Use Python 3 interpreter
      instances: 2,  // Run 2 parallel workers for concurrent downloads
      exec_mode: 'fork',  // Python uses fork mode (not Node cluster)
      
      // Environment variables
      env_file: '../.env',  // Relative to cwd (udemy_dl)
      
      // Working directory (important for Python imports)
      cwd: './udemy_dl',
      
      // Logs
      error_file: '../logs/worker-error.log',
      out_file: '../logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Auto restart settings
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',  // Workers should stay up at least 30s
      restart_delay: 5000,  // Wait 5s before restart
      
      // Memory limits (workers can use more memory for downloads)
      max_memory_restart: '2G',
      
      // Graceful shutdown (give workers time to finish current job)
      kill_timeout: 30000,  // 30 seconds to finish current download
      
      watch: false,
      
      // ⚠️ IMPORTANT: Each instance will get unique INSTANCE_ID env var (0, 1)
      instance_var: 'INSTANCE_ID'
    }
  ],

  /**
   * Deployment configuration (optional)
   * Uncomment and configure if you want to use `pm2 deploy`
   */
  // deploy: {
  //   production: {
  //     user: 'root',
  //     host: 'your-server-ip',
  //     ref: 'origin/main',
  //     repo: 'git@github.com:your-repo.git',
  //     path: '/root/server',
  //     'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production'
  //   }
  // }
};
