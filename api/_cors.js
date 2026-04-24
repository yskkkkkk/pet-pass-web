const DEV_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

function normalizeOrigin(value) {
  if (!value) return null;

  let origin = value.trim();
  if (!origin) return null;

  if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
    origin = `https://${origin}`;
  }

  try {
    return new URL(origin).origin;
  } catch (err) {
    return null;
  }
}

function parseOrigins(rawValue) {
  if (!rawValue) return [];

  return rawValue
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function getDerivedProductionOrigins() {
  const candidates = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL
  ];

  return candidates
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
}

function getAllowedOrigins() {
  const envOrigins = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);

  if (envOrigins.length > 0) {
    return [...new Set([...envOrigins, ...DEV_ALLOWED_ORIGINS])];
  }

  const derivedOrigins = getDerivedProductionOrigins();
  if (derivedOrigins.length > 0) {
    return [...new Set([...derivedOrigins, ...DEV_ALLOWED_ORIGINS])];
  }

  return DEV_ALLOWED_ORIGINS;
}

function resolveAllowedOrigin(req) {
  const origin = normalizeOrigin(req.headers.origin);
  if (!origin) return null;

  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin) ? origin : null;
}

function applyCors(req, res) {
  const allowedOrigin = resolveAllowedOrigin(req);

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  return Boolean(allowedOrigin);
}

function handlePreflight(req, res) {
  const isAllowed = applyCors(req, res);

  if (req.method === 'OPTIONS') {
    if (!isAllowed) {
      res.status(403).json({ error: '허용되지 않은 Origin 입니다.' });
      return true;
    }

    res.status(204).end();
    return true;
  }

  return false;
}

module.exports = {
  getAllowedOrigins,
  applyCors,
  handlePreflight
};
