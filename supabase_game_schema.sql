-- 소수결 게임 테이블 (/game)
-- Supabase SQL Editor에서 한 번 실행하세요.
-- 기존 stores 테이블과는 독립적입니다.

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

-- RLS를 켜고 정책을 두지 않음 → anon 키로는 접근 불가, 서버(secret key)만 읽고 쓸 수 있음
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_votes ENABLE ROW LEVEL SECURITY;
