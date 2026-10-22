'use strict';
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const logger = require('./config/logger');
const errorHandler = require('./middleware/errorHandler');
const { loadDaycareAuthConfig } = require('./config/daycare-auth');
const daycareAuthConfig = loadDaycareAuthConfig();

// Module routers
const authRoutes          = daycareAuthConfig.enabled
  ? require('./modules/daycare-auth/runtime').router
  : require('./modules/auth/auth.routes');
const usersRoutes         = daycareAuthConfig.enabled
  ? require('./modules/daycare-auth/runtime').usersRouter
  : require('./modules/users/users.routes');
const childrenRoutes      = require('./modules/children/children.routes');
const parentRoutes        = require('./modules/children/children.parent.routes');
const attendanceRoutes    = require('./modules/attendance/attendance.routes');
const reportsRoutes       = require('./modules/reports/reports.routes');
const healthRoutes        = require('./modules/health/health.routes');
const communicationRoutes = require('./modules/communication/communication.routes');
const aiGuideRoutes       = require('./modules/ai-guide/ai-guide.routes');
const biometricRoutes     = require('./modules/biometric/biometric.routes');
const storeRoutes         = require('./modules/store/store.routes');
const paymentsRoutes      = require('./modules/payments/payments.routes');
const eventsRoutes        = require('./modules/events/events.routes');
const auditRoutes         = require('./modules/audit/audit.routes');
const groupsRoutes        = require('./modules/groups/groups.routes');
const dashboardRoutes     = require('./modules/dashboard/dashboard.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const searchRoutes        = require('./modules/search/search.routes');
const saasRoutes          = require('./modules/saas/saas.routes');

const app = express();

// ──────────────────────────────────────────────
// 1. Security headers (NFR-SEC-04)
// ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ──────────────────────────────────────────────
// 2. CORS policy
// ──────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    if (daycareAuthConfig.enabled) {
      return callback(null, daycareAuthConfig.allowedOrigins.includes(origin));
    }
    if (process.env.NODE_ENV !== 'production') {
      // In development allow localhost, 127.0.0.1, LAN IPs (192.168.*), tunnels, etc.
      return callback(null, true);
    }
    const allowed = [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:8081'].filter(Boolean);
    if (allowed.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,             // allow HttpOnly cookies to be passed
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization', ...(daycareAuthConfig.enabled ? ['X-CSRF-Token'] : [])],
}));

// ──────────────────────────────────────────────
// 3. Rate limiting (global — prevents brute force)
// ──────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Stricter limiter for auth endpoints (NFR-SEC-04)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: { error: 'Too many login attempts, please try again later.' },
});

// ──────────────────────────────────────────────
// 4. Body parsing
// ──────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ──────────────────────────────────────────────
// 5. HTTP request logging (NFR-MNT-03)
// ──────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

// ──────────────────────────────────────────────
// 6. Cookie parser (for HttpOnly JWT cookies)
// ──────────────────────────────────────────────
app.use(cookieParser());  // Required for req.cookies to be populated (JWT cookie auth)

// ──────────────────────────────────────────────
// 7. Health & Root Check (unauthenticated)
// ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ankelba-backend', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Ankelba Backend API is running.',
    frontend_app_url: 'http://localhost:8081',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      parent: '/api/parent',
      portal: '/api/portal',
      store: '/api/store',
      events: '/api/events',
      communication: '/api/communication',
    },
    timestamp: new Date().toISOString(),
  });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// ──────────────────────────────────────────────
// 8. API routes
// ──────────────────────────────────────────────
// The legacy application endpoint also provisions an administrator. Both aliases
// stay closed in preview until the owner-approved application workflow exists.
if (daycareAuthConfig.enabled) {
  app.post(['/api/saas/register-daycare', '/api/register-daycare'],
    require('./modules/daycare-auth/runtime').disabledProvisioning);
}
app.use('/api/saas', saasRoutes);
app.use('/api', saasRoutes);
// Platform operators manage tenants through SaaS APIs, not private daycare records.
app.use([
  '/api/portal', '/api/children', '/api/parent', '/api/attendance',
  '/api/reports', '/api/health', '/api/communication', '/api/announcements',
  '/api/messages', '/api/contacts', '/api/alerts', '/api/ai', '/api/biometric',
  '/api/store', '/api/events', '/api/groups', '/api/dashboard',
  '/api/notifications', '/api/search', '/api/users', '/api/audit',
], require('./middleware/auth'), (req, res, next) => {
  if (!req.user?.daycare_id || (!['admin', 'caregiver', 'parent'].includes(req.user.role) && !req.user.is_impersonating)) {
    return res.status(403).json({ error: 'Daycare account required' });
  }
  next();
});
app.use('/api/portal', require('./modules/portal/portal.routes'));
app.use('/api/auth',          authLimiter, authRoutes);
if (daycareAuthConfig.enabled) {
  app.use('/api/platform/auth', authLimiter, require('./modules/daycare-auth/runtime').platformRouter);
}
app.use('/api/users',         usersRoutes);
app.use('/api/children',      childrenRoutes);
app.use('/api/parent',        parentRoutes);
app.use('/api/attendance',    attendanceRoutes);
app.use('/api/reports',       reportsRoutes);
app.use('/api/health',        healthRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api', communicationRoutes);
app.use('/api/ai',            aiGuideRoutes);
app.use('/api/biometric',     biometricRoutes);
app.use('/api/store',         storeRoutes);
app.use('/api/payments',      paymentsRoutes);
app.use('/api/events',        eventsRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/groups',        groupsRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/search',        searchRoutes);

// ──────────────────────────────────────────────
// 9. 404 handler
// ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ──────────────────────────────────────────────
// 10. Centralized error handler (NFR-MNT-03)
// ──────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
