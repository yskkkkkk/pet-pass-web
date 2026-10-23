/**
 * 단위 테스트 공통 도우미
 * - API 핸들러를 서버 없이 직접 부른다 (Vercel·Express와 같은 req/res 모양을 흉내 냄)
 * - 저장소는 메모리 모드로 강제한다
 */
process.env.GAME_STORE = 'memory';
delete process.env.VERCEL;

let ipSeq = 0;

/** 요청마다 다른 IP를 써서 요청 제한(rate limit)이 테스트끼리 섞이지 않게 한다 */
function nextIp() {
  ipSeq += 1;
  return `10.0.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

function call(handler, { method = 'GET', query = {}, body, headers = {}, ip } = {}) {
  return new Promise((resolve, reject) => {
    // sent: 응답을 보낸 횟수. 한 요청에 두 번 보내면 실서버에서는 오류이므로 테스트에서 확인한다.
    const res = {
      statusCode: 200,
      headers: {},
      sent: 0,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.sent += 1; resolve({ status: this.statusCode, body: payload, headers: this.headers, res: this }); return this; },
      end() { this.sent += 1; resolve({ status: this.statusCode, body: null, headers: this.headers, res: this }); return this; }
    };
    const req = {
      method,
      query,
      body,
      headers: { host: 'localhost:3000', 'x-forwarded-for': ip || nextIp(), ...headers },
      socket: { remoteAddress: '127.0.0.1' }
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function api(handler) {
  return {
    get: (query, opts) => call(handler, { method: 'GET', query, ...opts }),
    post: (body, opts) => call(handler, { method: 'POST', body, ...opts })
  };
}

module.exports = { call, api, nextIp };
