const LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

/**
 * 프로토콜 없는 값(pet-pass-web.vercel.app)을 https://...로 정규화.
 * 이미 http(s)://로 시작하면 그대로 반환.
 */
function normalizeOrigin(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * CORS_ALLOWED_ORIGINS 미설정 시 Vercel 자동 환경변수 + FRONTEND_URL/APP_URL에서
 * 프로덕션 Origin을 추론. 그래도 없으면 로컬 주소만 허용.
 */
function getAllowedOrigins() {
  const rawOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  const envOrigins = rawOrigins
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  if (envOrigins.length > 0) return envOrigins;

  // 명시적 설정이 없을 때 자동 추론
  const inferred = [
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL, // Vercel이 자동 주입 (프로덕션 URL)
  ]
    .map(normalizeOrigin)
    .filter(Boolean);

  return inferred.length > 0 ? [...LOCAL_ORIGINS, ...inferred] : LOCAL_ORIGINS;
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // 서버 간 통신/헬스체크 허용
  const normalized = normalizeOrigin(origin);
  return getAllowedOrigins().includes(normalized);
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

