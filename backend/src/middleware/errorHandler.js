'use strict';
/**
 * src/middleware/errorHandler.js
 * Centralized error handler — maps error types to HTTP codes.
 * Error code table from §13 of backend_architecture_plan_v2.md
 * SRS Refs: NFR-MNT-03, NFR-USA-03
 *
 * IMPORTANT: Never leak stack traces to clients (NFR-MNT-03).
 * Stack traces are written to the logger only.
 */
const logger = require('../config/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Log the full error server-side (NFR-MNT-03)
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    stack: err.stack,
    userId: req.user?.id || null,
  });

  // Map known error types to HTTP codes (§13)
  if (err.name === 'ValidationError' || err.isJoi) {
    return res.status(422).json({
      error: 'Validation failed',
      fields: err.details?.map((d) => ({ field: d.context?.key, message: d.message })) || [],
    });
  }

  const statusCode = err.statusCode || err.status;

  if (err.name === 'BadRequestError' || statusCode === 400) {
    return res.status(400).json({ error: err.message || 'Bad request' });
  }

  if (statusCode === 415) {
    return res.status(415).json({ error: err.message || 'Unsupported media type' });
  }

  if (statusCode === 429) {
    res.set('Retry-After', '900');
    return res.status(429).json({ error: err.message || 'Too many authentication attempts' });
  }

  if (err.name === 'UnauthorizedError' || statusCode === 401) {
    return res.status(401).json({ error: err.message || 'Authentication required' });
  }

  if (statusCode === 403) {
    return res.status(403).json({ error: err.message || 'Access denied' });
  }

  if (statusCode === 404 || err.name === 'NotFoundError') {
    return res.status(404).json({ error: err.message || 'Not found' });
  }

  if (statusCode === 409) {
    return res.status(409).json({ error: err.message || 'Conflict: Record already exists' });
  }

  if (statusCode === 422) {
    return res.status(422).json({ error: err.message || 'Unprocessable entity' });
  }

  if (statusCode === 503 || err.name === 'ServiceUnavailableError') {
    return res.status(503).json({ error: err.message || 'Service temporarily unavailable' });
  }

  // PostgreSQL unique violation
  if (err.code === '23514' && err.constraint === 'daycare_active_child_quota') {
    return res.status(409).json({ error: 'Your active child enrollment quota has been reached. Contact the platform owner to review your plan.' });
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'A record with this value already exists' });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(422).json({ error: 'Referenced record does not exist' });
  }

  // Default: 500 — never expose stack trace to client
  return res.status(500).json({ error: 'Internal server error' });
};

module.exports = errorHandler;
