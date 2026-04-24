/**
 * In-memory rate limiter.
 *
 * Works reliably on the Express server (server.js).
 * On Vercel serverless functions each warm instance has its own counter,
 * so protection is per-instance — still significantly reduces bot load.
 */

const store = new Map(); // { ip: { count, resetAt } }

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // prune expired entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of store) {
    if (entry.resetAt <= now) store.delete(ip);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Returns a middleware/handler-wrapper that limits calls per IP.
 *
 * @param {object} options
 * @param {number} options.max      - max requests per window (default 10)
 * @param {number} options.windowMs - window size in ms (default 60_000)
 * @returns {function} Express-style middleware  (req, res, next) => void
 */
function createRateLimiter({ max = 10, windowMs = 60_000 } = {}) {
  return function rateLimiter(req, res, next) {
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        retryAfter: retryAfterSec,
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
