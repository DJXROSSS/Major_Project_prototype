// Per auth-service process. Do not trust client-supplied forwarding headers.
function authRateLimit(limit = 15, windowMs = 15 * 60 * 1000) {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
    const identity = req.user?.id ?? String(req.body?.email || '').trim().toLowerCase().slice(0, 120);
    const key = `${req.ip}:${identity}`;
    const bucket = attempts.get(key) || { count: 0, until: now + windowMs };
    if (bucket.count >= limit || attempts.size >= 10000 && !attempts.has(key)) {
      res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000)));
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } });
    }
    bucket.count++; attempts.set(key, bucket); next();
  };
}
module.exports = { authRateLimit };
