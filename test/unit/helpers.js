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

/**
 * 끼어들기 도구: 저장소 함수 하나가 다음에 불릴 때 그 자리에서 멈춰 둔다.
 * 멈춘 사이 다른 요청(공개·재시작·시작 …)을 끼우고 resume()하면, 실서버에서 요청이 엇갈리는 순서를 그대로 만든다.
 *   const gate = pauseAt(store, 'listPlayers');
 *   const slow = get(...);            // listPlayers에서 멈춤
 *   await gate.reached;               // 멈춘 걸 확인
 *   await post(...restart...);        // 끼어들기
 *   gate.resume(); await slow;
 * when(args)로 멈출 호출을 고를 수 있다. 한 번 멈추면 원래 함수로 돌아간다.
 */
function pauseAt(store, method, when = () => true) {
  const original = store[method];
  let release;
  let reachedResolve;
  const reached = new Promise((r) => { reachedResolve = r; });
  const gate = new Promise((r) => { release = r; });
  store[method] = async (...args) => {
    if (!when(...args)) return original.apply(store, args);
    store[method] = original;
    reachedResolve();
    await gate;
    return original.apply(store, args);
  };
  return {
    reached,
    resume: () => release(),
    restore: () => { store[method] = original; }
  };
}

module.exports = { call, api, nextIp, pauseAt };
