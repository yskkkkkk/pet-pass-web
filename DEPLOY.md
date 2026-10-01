# 🚀 Pet-Pass Vercel 배포 가이드

이 가이드는 `pet-pass-web` 프로젝트를 Vercel에 성공적으로 배포하는 절차를 설명합니다.

---

## 1. Vercel 배포 단계

1. **GitHub 연동**:
   - Vercel Dashboard에서 `Add New > Project`를 선택합니다.
   - `pet-pass-web` 저장소를 Import 합니다.

2. **프로젝트 설정 (Configure Project)**:
   - **Framework Preset**: `Other` (또는 자동으로 인식됨)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

3. **환경 변수 설정 (Environment Variables)**:
   - 아래 항목들을 입력합니다:
     - `KAKAO_MAP_API_KEY`: 카카오 개발자 센터에서 발급받은 JavaScript 키
     - `DATA_GO_KR_API_KEY`: 공공데이터포털에서 발급받은 API 키 (동물등록정보 조회용)
     - `SUPABASE_URL`: Supabase 프로젝트 URL (`/api/stores` 매장 조회에 필요)
     - `SUPABASE_ANON_KEY`: Supabase anon 키
   - (선택) 커스텀 도메인 사용 시 `CORS_ALLOWED_ORIGINS` 또는 `FRONTEND_URL` 설정

4. **배포 (Deploy)**:
   - `Deploy` 버튼을 누르고 빌드가 완료될 때까지 기다립니다.

---

## 2. 배포 확인 및 도메인

1. 배포가 완료되면 `https://<프로젝트명>.vercel.app` 형태의 도메인이 할당됩니다.
2. 접속 후 **카카오맵**이 정상적으로 로드되는지 확인하세요.

---

## 3. 최종 체크리스트

- [x] `index.html`에 하드코딩된 API 키가 제거되었는가? → 빌드 시 `__KAKAO_MAP_API_KEY__` 플레이스홀더에 주입됨
- [x] Vercel Dashboard에 필수 환경 변수가 모두 등록되었는가?
- [x] `vercel.json`의 Rewrite 설정이 적용되어 새로고침 시 404가 발생하지 않는가?

---

## 4. 소수결 게임 (`/game`) 활성화

같은 프로젝트의 하위 경로로 배포됩니다. (`https://<도메인>/game`)

1. **DB 테이블 생성**: Supabase SQL Editor에서 `supabase_game_schema.sql`을 실행합니다.
2. **환경 변수 추가**: Vercel Dashboard → Environment Variables에 `SUPABASE_SECRET_KEY`(Supabase secret / service_role 키)를 추가합니다.
   - 게임 테이블은 RLS 정책이 없어 서버에서 secret 키로만 접근합니다. 키는 브라우저에 노출되지 않습니다.
   - 키가 없으면 `/api/game`이 503을 반환합니다.
3. **사용법**: PC에서 `/game` → "새 방 만들기" → 참가자는 휴대폰으로 QR을 찍거나 `/game`에서 4자리 코드 입력.
4. **로컬 테스트**: `SUPABASE_SECRET_KEY` 없이 `npm start` 하면 메모리 저장소로 동작합니다. (`GAME_STORE=memory`로 강제 가능)
5. 12시간 넘게 갱신이 없는 방은 새 방을 만들 때 자동 정리됩니다.

---

## 5. 관리자 운영 팁
- `api/stores.js`는 **Supabase `stores` 테이블**(`verified=true` 행)을 조회합니다. `data/stores.json`은 동기화 결과의 로컬 백업일 뿐, 런타임에서 참조하지 않습니다.
- 매장 데이터는 GitHub Actions 일일 동기화(`.github/workflows/daily_sync.yml`)가 식품안전나라 데이터를 받아 Supabase에 `UPSERT`하는 방식으로 자동 갱신됩니다.
- 매장을 수동으로 추가/수정하려면 Supabase `stores` 테이블에서 직접 편집하세요. (`verified=false` 행은 사용자에게 노출되지 않습니다.)
