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
| `/game/<게임>/host?room=1234` | 같이 하는 게임 진행 화면 (PC) |
| `/game/<게임>/play?room=1234` | 같이 하는 게임 참가 화면 (휴대폰) |
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
    common.js           서버 요청, 폴링, 저장소, 알림, 진행자 토큰(hostSession), 게임 정보(gameInfo)
    fx.js               웃음 장치: 카운트다운, 도장, 호외 헤드라인, 이름표 떨어지기, 효과음과 소리 끄기
    lobby.js            진행자 대기실: QR·방 코드, 참가자 목록·내보내기, 진행자 설정, 시작
    join.js             휴대폰 참가 화면 (방 코드, 닉네임)
    game.css            디자인 토큰과 공통 화면, 대기실·설정, 웃음 장치 모양
    vendor/qrcode.js    QR 생성 (qrcode-generator, MIT)
  minority/             소수결 게임 화면 (index, host, play, text.js 문구, minority.css)

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
| `game_rooms` | 방. `game`(게임 종류), `settings`(진행자 설정), `state`(게임별 방 상태), `status`(lobby / voting / playing / revealed / finished) |
| `game_players` | 참가자. `data`(점수·칩·비밀 정보 같은 사람별 상태) |
| `game_moves` | 라운드별 제출. `kind`로 한 라운드 안의 단계를 나눈다 (예: 교체 / 결정) |
| `game_votes` | 소수결 전용 A/B 표 |

- 새 게임은 진행 중 상태로 `playing`을 쓰고, 세부 단계는 `state`에 둔다.
- 스키마를 바꾸면 `test/sql/schema.test.mjs`가 "예전 DB에 두 번 실행해도 기존 데이터가 그대로인지"를 확인한다.

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

## 실서버에서 확인된 주의점

로컬은 응답이 빨라서 드러나지 않지만 실서버(Vercel + Supabase)에서는 응답 시간이 들쭉날쭉하다. 화면 테스트(`test/e2e/minority-latency.spec.js`)가 이 상황을 흉내 낸다.

- 상태 조회는 `MG.latestOnly()`로 감싸서, 늦게 도착한 예전 응답이 화면을 되돌리지 않게 한다
- 같은 사람이 연달아 보내는 요청(투표 변경 등)은 `MG.createSerialSender`로 한 번에 하나씩 순서대로 보낸다
- 바꾼 것마다 따로 보내야 하는 요청(진행자 설정)은 `MG.createQueue`로 줄을 세운다. "처리 중이면 무시"하는 잠금(busy)에 태우면 앞 응답을 기다리는 동안 바꾼 것이 조용히 버려진다 (대기실이 이미 줄을 세우므로 `onSettings`는 요청 Promise만 돌려주면 된다)
- 마감처럼 "누르는 순간"이 중요한 동작은 약간의 유예를 둔다 (소수결은 결과 공개 1초 유예)
- 지금은 1.5~2초 폴링이라 라운드제 게임에 맞다. 먼저 누르는 사람이 이기는 반응속도 게임은 맞지 않는다
