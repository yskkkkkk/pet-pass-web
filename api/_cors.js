const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

function getAllowedOrigins() {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  const envOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // 서버 간 통신/헬스체크 허용
  return getAllowedOrigins().includes(origin);
}

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || getAllowedOrigins()[0]);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  return isAllowedOrigin(origin);
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
  isAllowedOrigin,
  applyCors,
  handlePreflight
};
