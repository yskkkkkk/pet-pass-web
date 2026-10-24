-- 미니게임 테이블 (/game)
-- Supabase SQL Editor에서 실행하세요. 기존 stores 테이블과는 독립적입니다.
-- 여러 번 실행해도 안전합니다: 이미 있는 테이블·칸은 그대로 두고, 없는 것만 추가합니다.
-- (처음 설치할 때와, 새 칸이 추가된 버전으로 올릴 때 모두 이 파일 전체를 실행하면 됩니다)

CREATE TABLE IF NOT EXISTS game_rooms (
    code TEXT PRIMARY KEY,                          -- 4자리 숫자 방 코드
    host_token TEXT NOT NULL,                       -- 진행자(PC) 인증 토큰
    status TEXT NOT NULL DEFAULT 'lobby'
        CHECK (status IN ('lobby', 'voting', 'revealed', 'finished')),
    round INT NOT NULL DEFAULT 0,
    question_id INT,
    used_question_ids INT[] NOT NULL DEFAULT '{}',
    last_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    token TEXT NOT NULL,                            -- 참가자(모바일) 인증 토큰
    alive BOOLEAN NOT NULL DEFAULT TRUE,
    eliminated_round INT,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT game_players_room_nickname_key UNIQUE (room_code, nickname)
);
CREATE INDEX IF NOT EXISTS game_players_room_token_idx ON game_players (room_code, token);

CREATE TABLE IF NOT EXISTS game_votes (
    room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
    round INT NOT NULL,
    player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
    choice TEXT NOT NULL CHECK (choice IN ('A', 'B')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_code, round, player_id)
);

-- ───────── 미니게임 공통 기반 (2026-10 추가) ─────────
-- 방의 게임 종류, 진행자 설정, 게임별 방 상태
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'minority';
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE game_rooms ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 방 상태: 소수결은 voting, 새 게임들은 진행 중을 playing으로 쓴다. 세부 단계는 state에 둔다.
ALTER TABLE game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_status_check
    CHECK (status IN ('lobby', 'voting', 'playing', 'revealed', 'finished'));

-- 사람별 상태 (점수, 칩, 주사위·카드 같은 비밀 정보)
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 라운드별 제출 (입찰액, 버튼, 숫자, 승부/포기 …). kind로 한 라운드 안의 단계를 나눈다
CREATE TABLE IF NOT EXISTS game_moves (
    room_code TEXT NOT NULL REFERENCES game_rooms(code) ON DELETE CASCADE,
    round INT NOT NULL,
    player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'main',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_code, round, player_id, kind)
);

-- RLS를 켜고 정책을 두지 않음 → anon 키로는 접근 불가, 서버(secret key)만 읽고 쓸 수 있음
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_moves ENABLE ROW LEVEL SECURITY;
