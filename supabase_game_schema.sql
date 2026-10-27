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
-- closing: 공개(마감)를 시작해 제출을 더 받지 않는 짧은 상태 (2026-10-27 추가)
ALTER TABLE game_rooms DROP CONSTRAINT IF EXISTS game_rooms_status_check;
ALTER TABLE game_rooms ADD CONSTRAINT game_rooms_status_check
    CHECK (status IN ('lobby', 'voting', 'playing', 'closing', 'revealed', 'finished'));

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

-- ───────── 검사와 저장을 한 번에 (2026-10-27 추가) ─────────
-- 서버리스에서는 요청마다 따로 실행되므로, "방 상태를 확인하고 저장"을 서버 코드에서 두 번에 나눠 하면
-- 그 사이에 마감·시작이 끼어들 수 있다. 아래 함수는 방 줄을 잠근 채 확인과 저장을 한 번에 한다.

-- 제출: 방이 지금 받을 수 있는 상태·라운드·판 번호일 때만 저장한다. 저장했으면 TRUE.
-- 방 줄을 공유 잠금(FOR SHARE)해서, 마감(closing으로 바꾸는 UPDATE)과 겹치면 둘 중 하나가 먼저 끝난 뒤 진행된다.
-- → 마감과 겹친 제출은 "마감 전에 저장되어 결과에 반영" 또는 "거절" 둘 중 하나가 된다.
CREATE OR REPLACE FUNCTION game_submit_move(
    p_room TEXT, p_round INT, p_gen INT, p_player UUID, p_kind TEXT, p_payload JSONB, p_statuses TEXT[]
) RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    r game_rooms%ROWTYPE;
BEGIN
    SELECT * INTO r FROM game_rooms WHERE code = p_room FOR SHARE;
    IF NOT FOUND OR NOT (r.status = ANY (p_statuses)) OR r.round <> p_round
       OR COALESCE((r.state->>'gen')::INT, 0) <> p_gen THEN
        RETURN FALSE;
    END IF;
    INSERT INTO game_moves (room_code, round, player_id, kind, payload)
    VALUES (p_room, p_round, p_player, p_kind, p_payload)
    ON CONFLICT (room_code, round, player_id, kind)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
    RETURN TRUE;
END $$;

-- 참가: 대기실이고 자리가 남았을 때만 넣는다. 결과: ok / started / full / duplicate / missing
-- 방 줄을 배타 잠금(FOR UPDATE)해서 참가끼리, 그리고 시작(UPDATE)과 차례로 처리된다.
-- → 마지막 자리에 여럿이 와도 한 명만, 시작과 겹친 참가는 "시작 전에 들어와 명단에 포함" 또는 "거절".
CREATE OR REPLACE FUNCTION game_join(p_room TEXT, p_nickname TEXT, p_token TEXT, p_max INT)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    r game_rooms%ROWTYPE;
    n INT;
BEGIN
    SELECT * INTO r FROM game_rooms WHERE code = p_room FOR UPDATE;
    IF NOT FOUND THEN RETURN 'missing'; END IF;
    IF r.status <> 'lobby' THEN RETURN 'started'; END IF;
    SELECT count(*) INTO n FROM game_players WHERE room_code = p_room;
    IF n >= p_max THEN RETURN 'full'; END IF;
    INSERT INTO game_players (room_code, nickname, token) VALUES (p_room, p_nickname, p_token);
    RETURN 'ok';
EXCEPTION WHEN unique_violation THEN
    RETURN 'duplicate';
END $$;

-- 함수는 서버(secret key = service_role)만 부른다. 공개 키(anon)로는 부를 수 없게 막는다.
REVOKE ALL ON FUNCTION game_submit_move(TEXT, INT, INT, UUID, TEXT, JSONB, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_join(TEXT, TEXT, TEXT, INT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON FUNCTION game_submit_move(TEXT, INT, INT, UUID, TEXT, JSONB, TEXT[]) FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON FUNCTION game_join(TEXT, TEXT, TEXT, INT) FROM anon, authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION game_submit_move(TEXT, INT, INT, UUID, TEXT, JSONB, TEXT[]) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION game_join(TEXT, TEXT, TEXT, INT) TO service_role';
    END IF;
END $$;
