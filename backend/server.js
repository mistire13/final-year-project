'use strict';
require('dotenv').config();
const app = require('./src/app');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 5000;

const db = require('./src/config/db');
let server;
db.verifyRuntime().then(() => {
  server = app.listen(PORT, () => {
    logger.info(`Ankelba backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}).catch(async error => {
  logger.error('Database security verification failed; server was not started', { message: error.message });
  await db.closeAll();
  process.exitCode = 1;
});

// Graceful shutdown — close pool connections on SIGTERM/SIGINT
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  if (!server) return;
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  if (!server) return;
  server.close(async () => {
    await db.closeAll();
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
