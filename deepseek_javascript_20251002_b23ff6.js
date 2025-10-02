// monitoring/healthCheck.js
import express from 'express';
import os from 'os';

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: os.loadavg(),
    environment: process.env.NODE_ENV
  };

  try {
    // Check database connection
    const dbStatus = await checkDatabaseConnection();
    healthCheck.database = dbStatus;

    // Check Redis connection
    const redisStatus = await checkRedisConnection();
    healthCheck.redis = redisStatus;

    // Check external services
    healthCheck.externalServices = await checkExternalServices();

    const allServicesHealthy = dbStatus === 'connected' && redisStatus === 'connected';
    
    res.status(allServicesHealthy ? 200 : 503).json(healthCheck);
  } catch (error) {
    healthCheck.status = 'ERROR';
    healthCheck.error = error.message;
    res.status(503).json(healthCheck);
  }
});

// Metrics endpoint for Prometheus
router.get('/metrics', async (req, res) => {
  const metrics = {
    // Application metrics
    app_uptime: process.uptime(),
    app_memory_usage: process.memoryUsage().rss,
    app_cpu_usage: process.cpuUsage(),
    
    // System metrics
    system_load: os.loadavg(),
    system_memory: {
      total: os.totalmem(),
      free: os.freemem()
    },
    
    // Custom business metrics
    active_users: await getActiveUsersCount(),
    total_posts: await getTotalPostsCount(),
    api_requests_total: await getTotalApiRequests(),
    api_errors_total: await getTotalApiErrors()
  };

  res.json(metrics);
});

// Performance monitoring middleware
export const performanceMonitor = (req, res, next) => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const responseTime = duration[0] * 1000 + duration[1] / 1000000;
    
    // Log performance metrics
    console.log({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: responseTime.toFixed(2),
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // You can send this to a monitoring service
    sendToMonitoringService({
      endpoint: req.path,
      method: req.method,
      responseTime,
      statusCode: res.statusCode
    });
  });
  
  next();
};