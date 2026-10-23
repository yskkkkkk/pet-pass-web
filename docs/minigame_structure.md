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
  games.js              게임 목록 (허브와 서버가 함께 읽는 유일한 목록)
  index.html            허브
  play.html             참가 입구
  host.html             예전 진행 주소 호환
  shared/
    common.js           API 호출, 폴링, 늦게 온 응답 무시(latestOnly), 저장소, 알림
    game.css            디자인 토큰과 공통 화면(버튼, 입력, 허브, 진행/참가 화면 틀, 대기실)
    vendor/qrcode.js    QR 생성 (qrcode-generator, MIT)
  minority/             소수결 게임 화면 (index, host, play, minority.css)

api/game.js             같이 하는 게임 공통 API — 방 만들기·참가·내보내기·방 정보·상태 조회 입구
lib/game/
  core.js               방 코드, 토큰, 닉네임, 오류 형식
  store.js              저장소 (Supabase / 로컬 메모리)
  games/index.js        서버 모듈 연결 (games.js의 party 게임 ↔ 서버 모듈)
  games/minority/       소수결 규칙(rules.js), 문제(questions.js), 동작(index.js)
```

## 혼자 하는 게임 추가하기

서버가 필요 없다.

1. `public/game/<id>/index.html`에 게임을 만든다. 공통 스타일(`/game/shared/game.css`)을 쓰고, 외부 CDN 대신 필요한 라이브러리는 `shared/vendor/`나 게임 폴더에 넣는다.
2. `public/game/games.js`에 항목을 추가한다: `{ id, type: 'solo', name, tagline, path: '/game/<id>' }`
3. 허브의 "혼자 하는 게임" 칸은 게임이 하나라도 있으면 자동으로 나타난다.

## 같이 하는 게임 추가하기

1. **목록**: `public/game/games.js`에 `{ id, type: 'party', name, tagline, players, path }` 추가
2. **서버 규칙**: `lib/game/games/<id>/index.js`를 만들고 `lib/game/games/index.js`의 `MODULES`에 연결한다. 모듈이 내보낼 것:
   - `id` — games.js의 id와 같게
   - `actions` — `{ 이름: async (ctx) => 응답 }`. `POST /api/game { action: 이름, code, ... }`로 호출된다. `create`, `join`, `kick`은 공통이라 쓸 수 없다
   - `hostState(ctx)`, `playerState(ctx, me)` — 진행자/참가자 화면 상태
   - `ctx`는 `{ store, room, body, requireHost }`. 진행자 전용 동작은 처음에 `ctx.requireHost()`를 부른다
3. **화면**: `public/game/<id>/`에 `index.html`(방 만들기: `MG.post({ action: 'create', game: '<id>' })`), `host.html`, `play.html`을 만든다. 소수결 화면을 출발점으로 삼으면 된다. QR은 `/game/play?room=<code>`를 가리키게 한다
4. **DB (두 번째 같이 하는 게임을 추가할 때 한 번만)**: 지금은 방에 게임 종류를 저장하지 않아 모든 방을 소수결로 본다(`DEFAULT_GAME`). 아래 SQL을 Supabase에서 실행한 뒤, `api/game.js`의 `actionCreate`에서 기본 게임만 허용하는 부분을 지우고 `createRoom`에 `game`을 넣는다
   ```sql
   ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'minority';
   ```
   게임별로 방에 담을 상태가 소수결과 다르면, 같은 때에 `state JSONB` 칸을 함께 추가하는 것을 권장한다

## 실서버에서 확인된 주의점

로컬은 응답이 빨라서 드러나지 않지만 실서버(Vercel + Supabase)에서는 응답 시간이 들쭉날쭉하다.

- 상태 조회는 `MG.latestOnly()`로 감싸서, 늦게 도착한 예전 응답이 화면을 되돌리지 않게 한다
- 같은 사람이 연달아 보내는 요청(투표 변경 등)은 한 번에 하나씩 순서대로 보낸다
- 마감처럼 "누르는 순간"이 중요한 동작은 약간의 유예를 둔다 (소수결은 결과 공개 1초 유예)
- 지금은 1.5~2초 폴링이라 라운드제 게임에 맞다. 먼저 누르는 사람이 이기는 반응속도 게임은 맞지 않는다
