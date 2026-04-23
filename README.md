# 🐾 Pet-Pass

반려동물 동반 가능 매장 실시간 탐색 및 디지털 펫 패스 인증 서비스.

- **Service:** [https://pet-pass-web.vercel.app/](https://pet-pass-web.vercel.app/)
- **Blog:** [https://pet-pass-web.vercel.app/blog](https://pet-pass-web.vercel.app/blog)

---

## 🤖 AI Development Protocol

이 섹션은 Jules, Codex, Antigravity 등 AI 협업 에이전트들이 프로젝트 컨텍스트를 즉시 파악하고 효율적으로 기여하기 위한 기술 지침입니다.

### 🛠 Tech Stack
- **Frontend:** Vanilla JS, Tailwind CSS, Kakao Maps API
- **Backend:** Vercel Serverless Functions (Node.js)
- **Database:** Supabase (PostgreSQL)
- **CI/CD:** GitHub Actions, Vercel

### 🔄 Data Flow & Logic
1. **Sync Pipeline:** GitHub Actions가 정기적으로 공공데이터(Excel/API)를 읽어 Supabase에 `UPSERT` 합니다.
2. **Geocoding & Caching:** 신규 매장(좌표 없는 데이터)에 대해서만 Kakao API를 호출하여 좌표를 추출합니다. 기존 데이터의 좌표는 DB에서 캐싱되어 재사용됩니다.
3. **Frontend Rendering:** 클라이언트에서 Supabase API를 통해 전체 매장 데이터를 가져와 지도에 렌더링하며, 필터링 및 검색은 클라이언트 사이드에서 최적화된 루프로 처리합니다.

### 📜 Collaboration Principles
- **Documentation Only:** 로직 수정이 없는 문서 작업(`README`, `docs` 등) 커밋 시 반드시 `[skip ci]`를 포함하여 불필요한 빌드를 방지합니다.
- **Commit Convention:** 아래의 접두사를 엄격히 준수합니다.
  - `feat:` 신규 기능 추가
  - `fix:` 버그 수정
  - `docs:` 문서 수정
  - `chore:` 빌드 업무, 패키지 매니저 설정 등
- **Performance First:** 대용량 데이터(1,700+) 처리 시 불필요한 고차 함수 체이닝보다는 성능 위주의 루프를 선호합니다.

---

## 📂 Project Structure Summary

| Folder | Role |
| :--- | :--- |
| `/api` | Vercel Serverless Functions (Backend API endpoints) |
| `/public` | Frontend static assets (HTML, CSS, JS, Blog) |
| `/scripts` | Data sync, build, and utility scripts |
| `/data` | Raw data files and local storage for development |
| `/docs` | Development history and manual documents |
| `.github/workflows` | CI/CD automation (Daily sync, Deployment) |

---

## 🚀 Setup & Execution
1. **Environment:** `.env` 파일에 `KAKAO_MAP_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATA_GO_KR_API_KEY` 설정 필요.
2. **Install:** `npm install`
3. **Local Dev:** `npm start` (Express 서버 실행)
4. **Build:** `npm run build` (API Key 주입 및 배포 자산 생성)
