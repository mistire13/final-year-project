'use strict';

const realtime = require('./hub');

// Only public-facing data domains. Never send record IDs, names, or contents.
const resources = [
  [/^\/api\/attendance(?:\/|$)/, 'attendance'],
  [/^\/api\/portal\/(?:attendance|checkout)(?:\/|$)/, 'attendance'],
  [/^\/api\/reports(?:\/|$)/, 'reports'],
  [/^\/api\/health(?:\/|$)/, 'health'],
  [/^\/api\/events(?:\/|$)/, 'events'],
  [/^\/api\/(?:communication\/)?announcements(?:\/|$)/, 'announcements'],
  [/^\/api\/(?:communication\/)?alerts(?:\/|$)/, 'alerts'],
  [/^\/api\/children(?:\/|$)/, 'children'],
  [/^\/api\/parent\/children(?:\/|$)/, 'children'],
  [/^\/api\/(?:finances|daycare-payments)(?:\/|$)/, 'finances'],
  [/^\/api\/store(?:\/|$)/, 'store'],
  [/^\/api\/groups(?:\/|$)/, 'groups'],
  [/^\/api\/(?:billing-automation|staff-scheduling)(?:\/|$)/, 'billing'],
  [/^\/api\/portal(?:\/|$)/, 'workspace'],
];

function resourceForMutation(method, path) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || typeof path !== 'string') return null;
  const cleanPath = path.split('?')[0];
  return resources.find(([pattern]) => pattern.test(cleanPath))?.[1] || null;
}

function notifySuccessfulMutation(req, res, next) {
  const resource = resourceForMutation(req.method, req.originalUrl || req.url);
  if (resource) res.once('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user?.daycare_id) {
      realtime.publishResource(Number(req.user.daycare_id), resource);
    }
  });
  next();
}

module.exports = { resourceForMutation, notifySuccessfulMutation };
