# 미니게임 구조와 게임 추가 방법

> 앞으로 만들 게임의 규칙은 `docs/minigame_plan.md`, 진행 순서와 상황은 `docs/minigame_roadmap.md`.

`/game` 아래는 펫패스와 독립된 미니게임 모음이다. 같은 Vercel 프로젝트와 Supabase를 쓰지만, 코드와 테이블은 펫패스 기능과 섞이지 않는다.
나중에 별도 프로젝트로 옮길 수 있도록 게임 코드는 아래 위치에만 둔다.

## 주소

| 주소 | 내용 |
|---|---|
| `/game` | 허브 — 게임 목록, 참가 코드 입력 |
| `/game/play?room=1234` | 같이 하는 게임 참가 입구. QR 코드가 이 주소를 가리킨다. 방의 게임을 확인해 `<게임 경로>/play`로 보낸다 |
| `/game/<게임>` | 게임 첫 화면 (소개, 방 만들기) |
| `/game/<게임>/host?room=1234` | 같이 하는 게임 진행 화면 (PC — 경매는 선택 사항) |
| `/game/<게임>/play?room=1234` | 같이 하는 게임 참가 화면 (휴대폰. 휴대폰만으로 진행하는 방이면 경매장 화면과 방장 버튼까지) |
| `/game/host?room=…` | 예전 주소 호환 — 소수결 진행 화면으로 보낸다 |

## 파일

```
public/game/
  games.js              게임 목록 (허브·화면·서버가 함께 읽는 유일한 목록: 인원, 진행자 설정 정의 포함)
  index.html            허브
  play.html             참가 입구
  host.html             예전 진행 주소 호환
  shared/
    logic.js            순수 로직 (단위·뮤테이션 테스트 대상): latestOnly, createSerialSender, createQueue, escapeHtml, pickOne, fill
    common.js           서버 요청, 폴링(간격을 함수로도), 저장소, 알림, 진행자 토큰(hostSession), 게임 정보(gameInfo)
    fx.js               웃음 장치: 카운트다운(countdown, 정해진 시각까지 countdownTo), 도장, 호외 헤드라인, 이름표 떨어지기,
                        효과음(망치·칩·펑·북 등)과 소리 끄기, 시간표대로 연출하기(timeline — 중간부터 시작 가능)
    lobby.js            진행자 대기실: QR·방 코드, 참가자 목록·내보내기, 진행자 설정(hidden 설정은 숨김), 시작 (휴대폰에서도 그대로)
    join.js             휴대폰 참가 화면 (방 코드, 닉네임)
    scoreboard.js       순위표 (순위가 바뀌면 줄이 미끄러져 움직임)
    awards.js           최종 시상식 (상을 한 장씩, 수상 도장)
    game.css            디자인 토큰과 공통 화면, 대기실·설정, 웃음 장치 모양
    vendor/qrcode.js    QR 생성 (qrcode-generator, MIT)
  minority/             소수결 게임 화면 (index, host, play, text.js 문구, minority.css)
  auction/              블라인드 경매: show.js(공개 순서·시각·문구, 순수 함수), art.js(손·봉투·칩), items-art.js(물건 그림 41개),
                        stage.js(경매장 그리기 — PC와 휴대폰 공용), host.js(PC), play.js(휴대폰), auction.css

api/game.js             같이 하는 게임 공통 API — 방 만들기·참가·내보내기·진행자 설정·방 정보·상태 조회 입구
lib/game/
  core.js               방 코드, 토큰, 닉네임, 오류 형식
  store.js              저장소 (Supabase / 로컬 메모리) — 방, 참가자, 제출(moves), 소수결 표(votes)
  settings.js           진행자 설정 기본값·검사
  round.js              참가자 확인, 제출 받기, 조건부 마감(중복 공개 방지)
  scoreboard.js         점수로 순위 (동점은 같은 순위)
  awards.js             최종 시상식 상 고르기, 기록(stats) 올리기
  games/index.js        서버 모듈 연결 (games.js의 party 게임 ↔ 서버 모듈)
  games/minority/       소수결 규칙(rules.js), 문제(questions.js), 동작(index.js)
  games/auction/        블라인드 경매 규칙(rules.js), 물건(items.js), 동작(index.js)

supabase_game_schema.sql   게임 테이블. 여러 번 실행해도 안전 (바뀔 때마다 전체를 다시 실행)
test/unit/              단위 테스트 (node --test)
test/sql/               스키마 테스트 (PGlite — 실제 Postgres 엔진)
test/e2e/               화면 테스트 (Playwright)
```

### 화면 스크립트 읽는 순서

```html
<script src="/game/games.js"></script>            <!-- 진행 화면만 (대기실이 게임 정보를 씀) -->
<script src="/game/shared/vendor/qrcode.js"></script> <!-- 진행 화면만 -->
<script src="/game/shared/logic.js"></script>
<script src="/game/shared/common.js"></script>
<script src="/game/shared/fx.js"></script>
<script src="/game/shared/lobby.js"></script>      <!-- 진행 화면 -->
<script src="/game/shared/join.js"></script>       <!-- 참가 화면 -->
```

## 데이터 (supabase_game_schema.sql)

| 테이블 | 쓰임 |
|---|---|
| `game_rooms` | 방. `game`(게임 종류), `settings`(진행자 설정), `state`(게임별 방 상태·판 번호·칩/탈락), `status`(lobby / voting / playing / closing / revealed / finished) |
| `game_players` | 참가자. `data`(점수·칩·비밀 정보 같은 사람별 상태) |
| `game_moves` | 라운드별 제출. `kind` = 단계 이름 + 판 번호 (예: `vote:3`, `main:2`). 소수결 표도 여기에 저장 |
| `game_votes` | 예전 소수결 표 (이 구조 전에 공개된 결과를 읽을 때만 쓴다) |

- 새 게임은 진행 중 상태로 `playing`을 쓰고, 세부 단계는 `state`에 둔다.
- 스키마를 바꾸면 `test/sql/schema.test.mjs`가 "예전 DB에 두 번 실행해도 기존 데이터가 그대로인지"를 확인한다.
- DB 함수 `game_join`, `game_submit_move`는 서버(service_role)만 부를 수 있다. 같은 테스트 파일에서 판단 결과를 확인한다 (동시 잠금 자체는 PGlite가 연결 하나라 시험하지 못하고, Postgres의 행 잠금 규칙에 기댄다).

## 혼자 하는 게임 추가하기

서버가 필요 없다.

1. `public/game/<id>/index.html`에 게임을 만든다. 공통 스타일(`/game/shared/game.css`)을 쓰고, 외부 CDN 대신 필요한 라이브러리는 `shared/vendor/`나 게임 폴더에 넣는다.
2. `public/game/games.js`에 항목을 추가한다: `{ id, type: 'solo', name, tagline, path: '/game/<id>' }`
3. 허브의 "혼자 하는 게임" 칸은 게임이 하나라도 있으면 자동으로 나타난다.

## 같이 하는 게임 추가하기

1. **목록**: `public/game/games.js`에 `{ id, type: 'party', name, tagline, players, path, minPlayers, maxPlayers, settings }` 추가
   - `settings` 예: `{ key: 'rounds', label: '라운드 수', type: 'int', min: 3, max: 20, default: 10 }` (종류: int / bool / choice). 대기실에 입력칸이 자동으로 생기고, 서버가 같은 정의로 검사한다
2. **서버 규칙**: `lib/game/games/<id>/`에 규칙(순수 함수)과 `index.js`(동작)를 만들고 `lib/game/games/index.js`의 `MODULES`에 연결한다. 모듈이 내보낼 것:
   - `id` — games.js의 id와 같게
   - `actions` — `{ 이름: async (ctx) => 응답 }`. `POST /api/game { action: 이름, code, ... }`로 호출된다. `create`, `join`, `kick`, `settings`는 공통이라 쓸 수 없다
   - `hostState(ctx)`, `playerState(ctx, me)` — 진행자/참가자 화면 상태 (응답에는 공통으로 `game`, `settings`가 붙는다)
   - `ctx`는 `{ store, room, body, game: { info, module }, requireHost }`. 진행자 전용 동작은 처음에 `ctx.requireHost()`를 부른다
   - 제출은 `round.submitMove`, 마감·상태 전환은 `round.transition`, 순위는 `scoreboard.rankPlayers`, 시상식은 `awards.pickAwards`를 쓴다
3. **화면**: `public/game/<id>/`에 `index.html`(방 만들기: `MG.post({ action: 'create', game: '<id>' })`), `host.html`, `play.html`을 만든다
   - 대기실은 `MG.lobby.mount`, 참가는 `MG.join.show`, 연달아 바뀌는 제출은 `MG.createSerialSender`, 상태 조회는 `MG.latestOnly`
   - 화면과 무관한 판단·문구는 `logic.js`나 게임 폴더의 순수 함수 파일(`text.js`처럼 브라우저·Node 양쪽에서 읽히게)로 빼서 테스트한다
   - 웃음 장치(`MG.fx`)를 최소 하나는 쓴다 (`docs/minigame_plan.md` 2-1)
4. **테스트** (아래 "테스트" 참고): 규칙 단위 테스트, API 흐름, 화면 테스트(응답 지연 상황 포함), 뮤테이션 95% 이상

## 테스트

| 명령 | 내용 |
|---|---|
| `npm test` | 단위 테스트 — 규칙, 공통 도구, 저장소, API 전체(서버 없이 핸들러 직접 호출), 화면 순수 로직 |
| `npm run test:sql` | 스키마 테스트 — 예전 DB에 두 번 실행, 새로 설치, 제약·삭제·RLS |
| `npm run test:e2e` | 화면 테스트 — 테스트 서버(3100번, 메모리 저장소)를 띄우고 진행자·참가자 화면을 자동 조작. 브라우저 위치를 바꿔야 하면 `PLAYWRIGHT_CHROMIUM_PATH` |
| `npm run test:mutation` | 뮤테이션 테스트(Stryker) — 코드를 조금씩 망가뜨려 단위 테스트가 잡는지 확인. **95% 미만이면 실패**. 보고서는 `reports/mutation/index.html` |

PR마다 GitHub Actions(`.github/workflows/test.yml`)가 네 가지를 모두 돌린다.

- 실제 Supabase가 필요한 저장소 코드(`createSupabaseStore`)는 뮤테이션 대상에서 뺀다. 메모리 저장소가 같은 동작을 하도록 맞추고 실서버에서 확인한다.
- 바꿔도 결과가 같아서 어떤 테스트로도 구분할 수 없는 뮤턴트(로그 문구 등)는 `// Stryker disable next-line …: 이유`로 이유를 남겨 뺀다.
  `Stryker disable all … restore all` 구간 제외는 함수 안쪽 끝에 두면 restore가 먹지 않아 파일 나머지가 통째로 빠진다. 한 줄 제외(`next-line`)를 쓴다.
- 무작위가 들어가는 규칙은 무작위 함수를 인자로 바꿔 끼울 수 있게 해서, 테스트는 운에 맡기지 않고 모든 경우를 확인한다.

## 휴대폰만으로 진행하기 (블라인드 경매)

- 첫 화면에서 방장 닉네임을 넣고 "휴대폰으로 시작" → `create { settings: { screen: 'phone' }, nickname }`. 방장은 진행자 토큰과 참가자 토큰을 둘 다 받아 같이 논다
- `screen` 설정은 `hidden: true`라 대기실에 칸이 없다. 휴대폰 화면은 이 값으로 "경매장 화면"(stage.js)과 "입찰칸만"(PC 방)을 고른다
- 참가자 상태(playerState)도 진행 화면과 같은 공개 정보(일정표, 봉투 현황, 순위)를 받는다. 입찰 금액은 공개 전까지 본인 것만
- 공개 연출은 서버가 알려준 "공개 후 경과 시간"(revealAgeMs)으로 모든 휴대폰이 `공개 시각 + 3.5초`에 시작한다. 늦게 받거나 새로고침한 휴대폰은 `fx.timeline`의 offset으로 지난 장면부터 이어서 튼다
- 휴대폰만으로 진행하는 방은 폴링을 1초로 (PC 방은 2초)

## 요청이 엇갈릴 때 (2차 리뷰에서 배운 것)

실서버에서는 요청마다 따로 실행된다. 한 요청이 "읽고 → 쓰기" 사이에 있을 때 다른 요청(공개, 다음, 한 판 더, 시작, 참가)이 끼어들 수 있다. 응답이 느린 경우만 흉내 내면 이런 순서는 못 잡는다.

**원칙**
- **확인과 저장은 DB가 한 번에.** 참가는 `store.joinRoom`(DB 함수 `game_join`: 방 줄을 잠그고 대기실·정원 확인 후 참가), 제출은 `store.submitMove`(`game_submit_move`: 방 줄을 잠그고 상태·라운드·판 번호 확인 후 저장)로만 한다. 서버 코드에서 "읽고 확인 → 따로 저장"으로 나누면 그 사이에 마감·시작이 끼어든다. 메모리 저장소는 같은 판단 순서를 await 없이 처리한다.
- **마감은 잠그고 나서 읽는다.** 공개는 `round.beginClose`로 방을 `closing`(마감 중)으로 바꾼 뒤 제출을 읽고, `closing`에서만 결과로 넘어간다. 마감과 겹친 제출은 "잠그기 전에 저장되어 결과에 반영" 또는 "거절" 둘 중 하나다. `closing`은 화면에는 투표·입찰 중으로 보이고, 공개가 중간에 실패하면 다시 눌러 이어 간다.
- **한 동작의 쓰기는 방 한 줄에, 조건부로 한 번.** 판정·정산·탈락처럼 같이 바뀌어야 하는 값은 `room.state`에 함께 두고 `round.transition`(상태·라운드 조건부)으로 쓴다. 방을 쓰고 참가자 줄을 또 쓰면 사이에 실패·끼어들기가 생긴다. 경매의 칩·점수(`state.players`), 소수결의 탈락(`state.out`)이 이렇게 되어 있다.
- **읽은 값으로 나중에 "고치는" 쓰기를 하지 않는다.** 읽은 뒤에 판이 바뀌면 "같은 값"이 지난 판의 값이 된다 (조회 중 복구가 새 판을 오염시킨 반례).
- **제출은 판 번호가 붙은 칸에 저장한다** (`round.moveKind` → `'main:3'`). 검사를 통과하고 저장 직전에 멈춘 지난 판 제출은 아무도 읽지 않는 칸에 들어간다. 판 번호(`state.gen`)는 새 판 시작·문제 바꾸기마다 올라가고, 한 판 더(대기실로)에서는 유지한다.
- **참가와 시작이 겹치면 참가자를 남긴다.** 시작이 이미 셌을 수 있다. 게임은 늦게 들어온 참가자를 처리해야 한다 (경매: 시작 칩, 소수결: 생존).
- **화면도 같다.** 저장 중인 값은 요청 번호로 구별하고(값 비교 금지), 시작 같은 동작은 저장 중인 설정 뒤에 줄을 세우고, 화면이 바뀐 뒤 도착한 콜백은 무시한다.

**테스트: 끼어들기 도구** (`test/unit/helpers.js`의 `pauseAt`, 예: `test/unit/interleave.test.js`)
```js
const gate = pauseAt(store, 'listPlayers');   // 다음 호출을 그 자리에서 멈춤
const slow = hostState(r);                    // 방을 읽고 참가자 목록에서 멈춘 조회
await gate.reached;
await host(r, 'restart'); await host(r, 'start'); // 끼어들기
gate.resume(); await slow;                    // 재개 → 새 판이 오염되지 않았는지 확인
```

**새 게임 점검표** — 게임 모듈의 동작마다 "읽는 곳 → 쓰는 곳"을 적고, 그 사이에 아래를 하나씩 끼워 본다.

| 끼울 요청 | 확인할 것 |
|---|---|
| 같은 동작 두 번 (공개·다음·시작) | 한 번만 반영 |
| 공개(마감) | 마감 뒤 저장된 제출이 결과·화면과 어긋나지 않음 |
| 문제 바꾸기 / 한 판 더 → 시작 | 지난 판 제출·정산이 새 판에 들어가지 않음 |
| 다음 라운드 → 공개 | 늦은 조회·제출이 이전 라운드 값으로 되돌리지 않음 |
| 참가 | 정원·최소 인원이 깨지지 않음 |
| 저장소 오류 (쓰기 실패) | 아무것도 반영되지 않거나 전부 반영 (반만은 없음), 다시 시도 가능 |

## 실서버에서 확인된 주의점

로컬은 응답이 빨라서 드러나지 않지만 실서버(Vercel + Supabase)에서는 응답 시간이 들쭉날쭉하다. 화면 테스트(`test/e2e/minority-latency.spec.js`)가 이 상황을 흉내 낸다.

- 상태 조회는 `MG.latestOnly()`로 감싸서, 늦게 도착한 예전 응답이 화면을 되돌리지 않게 한다
- 같은 사람이 연달아 보내는 요청(투표 변경 등)은 `MG.createSerialSender`로 한 번에 하나씩 순서대로 보낸다
- 바꾼 것마다 따로 보내야 하는 요청(진행자 설정)은 `MG.createQueue`로 줄을 세운다. "처리 중이면 무시"하는 잠금(busy)에 태우면 앞 응답을 기다리는 동안 바꾼 것이 조용히 버려진다 (대기실이 이미 줄을 세우므로 `onSettings`는 요청 Promise만 돌려주면 된다)
- 마감처럼 "누르는 순간"이 중요한 동작은 약간의 유예를 둔다 (소수결은 결과 공개 1초 유예)
- 지금은 1.5~2초 폴링이라 라운드제 게임에 맞다. 먼저 누르는 사람이 이기는 반응속도 게임은 맞지 않는다
