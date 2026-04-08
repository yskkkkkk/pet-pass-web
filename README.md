# 🐾 Pet-Pass (이미지 기반 디지털 반려견 증명 서비스)

공공데이터포털(국가동물보호정보시스템)과 실시간 연동되어 반려견의 등록 여부를 인증하고, 인증된 정보를 디지털 패스로 관리하는 웹 애플리케이션입니다.

---

## 🚀 중요: 작업 지침 (Working Guidelines)

이 프로젝트는 Antigravity AI와 함께 개발하며, 지속적인 유지보수와 안정적인 버전 관리를 위해 아래 규칙을 반드시 준수합니다.

> [!IMPORTANT]
> **1. 소통 및 문서화 언어**
> - 모든 소통(대화) 및 프로젝트 관련 문서(README, 계획서, 작업 로그 등)는 **한국어**를 원칙으로 합니다.
>
> **2. 새로운 대화(Conversation) 시작 시 브랜치 생성**
> - 새로운 작업이나 상담이 시작되면 반드시 `main` 브랜치에서 새로운 작업 브랜치를 생성하여 이동합니다.
> - 명령어: `git checkout -b feature/작업명`
>
> **3. 작업 완료 후 Merge**
> - 작업이 완료되고 테스트가 끝나면 `main` 브랜치로 병합(Merge)하여 최신 상태를 유지합니다.

---

## 📂 프로젝트 구조 (Structure)

```text
/
├── public/                 # 프론트엔드 정적 자원
│   ├── index.html          # 메인 페이지 및 UI 구조
│   ├── style.css           # 프로젝트 스타일시트
│   ├── script.js           # 지도 로직 및 인증 핸들러
│   └── data.js             # 지역 데이터 및 초기 데이터베이스
├── server.js               # Node.js (Express) 백엔드 프록시 서버
├── .env                    # 민감 정보 (정부 API Key 등, .gitignore 대상)
├── .gitignore              # Git 제외 파일 목록
├── package.json            # 프로젝트 의존성 관리
└── README.md               # 프로젝트 지침서 (본 파일)
```

---

## 🛠️ 실행 방법

1. **의존성 설치**: `npm install`
2. **API 키 설정**: `.env` 파일을 생성하고 `DATA_GO_KR_API_KEY` 발급 키를 입력합니다.
3. **서버 실행**: `node server.js`
4. **접속**: `http://localhost:3000`

---

## 🛡️ 기술 스택
- **Frontend**: Vanilla JS, Kakao Maps API, Hangul.js
- **Backend**: Node.js, Express, Axios
- **API**: 농림축산식품부_동물등록정보조회 (V3)
