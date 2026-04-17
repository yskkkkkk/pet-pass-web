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
     - `DATA_GO_KR_API_KEY`: 공공데이터포털에서 발급받은 API 키

4. **배포 (Deploy)**:
   - `Deploy` 버튼을 누르고 빌드가 완료될 때까지 기다립니다.

---

## 2. 배포 확인 및 도메인

1. 배포가 완료되면 `https://<프로젝트명>.vercel.app` 형태의 도메인이 할당됩니다.
2. 접속 후 **카카오맵**이 정상적으로 로드되는지 확인하세요.

---

## 3. 최종 체크리스트

- [ ] `index.html`에 하드코딩된 API 키가 제거되었는가?
- [ ] Vercel Dashboard에 2개의 필수 환경 변수가 모두 등록되었는가?
- [ ] `vercel.json`의 Rewrite 설정이 적용되어 새로고침 시 404가 발생하지 않는가?

---

## 4. 관리자 운영 팁
- `api/stores.js`는 `data/stores.json` 파일을 참조합니다.
- 새로운 매장을 정식 추가하려면 `data/stores.json`에 데이터를 수동으로 추가하고 GitHub에 푸시하세요. (Vercel이 자동으로 재배포합니다.)
