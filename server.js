const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 프론트엔드 파일(현재 폴더)을 정적으로 서빙합니다.
app.use(express.static(__dirname));

/**
 * [Proxy Endpoint]
 * 공공데이터포털 - 농림축산식품부_동물등록정보조회
 * 클라이언트(브라우저)에서 CORS 우회를 위해 이 서버로 요청을 보내면,
 * 서버가 안전하게 환경변수(.env)에 숨겨둔 API KEY를 조합하여 진짜 정부 API를 호출합니다.
 */
app.get('/api/auth-pet', async (req, res) => {
  const { dogRegNo, ownerBirth } = req.query; // 클라이언트로부터 받은 동물등록번호 및 생년월일
  
  if (!dogRegNo || !ownerBirth) {
    return res.status(400).json({ error: "동물등록번호와 생년월일이 필요합니다." });
  }

  // 15자리 미만 보안 체크
  if (dogRegNo.length < 15) {
    return res.status(400).json({ error: "유효하지 않은 등록번호 형식입니다. (15자리 필수)" });
  }

  // 아직 사용자가 .env 에 API Key를 발급받아 넣지 않은 경우 (Mock 응답 반환)
  if (!process.env.DATA_GO_KR_API_KEY || process.env.DATA_GO_KR_API_KEY === 'YOUR_GOVERNMENT_API_KEY_HERE') {
    console.log("[DEV MODE] 정부 API 키가 세팅되지 않아 가상의 인증 성공 응답을 내보냅니다.");
    
    // 단순 지연 시뮬레이션
    setTimeout(() => {
      return res.json({
        success: true,
        message: "API Key 미설정 (테스트 모드)",
        data: {
          dogRegNo: dogRegNo,
          ownerBirth: ownerBirth,
          vaccinationStatus: "완료 (2026-03-01)"
        }
      });
    }, 1500);
    return;
  }

  // 실제 정부 API 통신 로직 (API 키 세팅 시 동작)
  try {
    // 최신 v3 엔드포인트 사용 (HTTPS 보안 주소 적용)
    const GOV_API_URL = 'https://apis.data.go.kr/1543061/animalInfoSrvc_v3/animalInfo_v3';
    
    // 인증키 이중 인코딩 방지를 위해 라이브러리 자동 인코딩 대신 직접 조립
    const rawServiceKey = process.env.DATA_GO_KR_API_KEY;
    const serviceKey = encodeURIComponent(rawServiceKey);

    // v3 필수 파라미터들 (생년월일 기반 조회로 전환)
    const rfid_cd = ""; 
    const owner_nm = ""; // 성명은 비우고 생년월일만 사용
    
    // 최종 URL 조립 (모든 필수 파라미터 포함)
    const fullURL = `${GOV_API_URL}?serviceKey=${serviceKey}&dog_reg_no=${dogRegNo}&rfid_cd=${rfid_cd}&owner_nm=${owner_nm}&owner_birth=${ownerBirth}&_type=json`;

    console.log(`[REQUEST] 정부 API 호출 시작 (V3 / HTTPS / All Params)`);
    console.log(`[DEBUG] Key(Encoded): ${serviceKey.substring(0, 15)}...`);

    const https = require('https');
    const agent = new https.Agent({  
      rejectUnauthorized: false
    });

    const response = await axios.get(fullURL, { httpsAgent: agent });

    const header = response.data?.response?.header;
    const body = response.data?.response?.body;
    
    // 1. 통신 성공(00)이고, 2. 검색 결과(item)에 실제 데이터가 들어있어야 진짜 성공입니다.
    const isSuccess = header?.resultCode === '00';
    const hasData = body?.item && Object.keys(body.item).length > 0;

    if (isSuccess && hasData) {
      return res.json({
        success: true,
        message: "국가동물보호정보시스템 인증에 성공하였습니다.",
        data: body.item
      });
    } else {
      // 통신은 성공했으나 해당 번호로 조회된 강아지가 없는 경우 (또는 다른 오류)
      const errorMsg = !hasData ? "공식 등록되지 않은 번호이거나 소유자 정보가 일치하지 않습니다." : (header?.resultMsg || "인증 실패");
      return res.status(400).json({
        success: false,
        error: errorMsg
      });
    }

  } catch (error) {
    console.error("정부 API 통신 에러:", error.message);
    
    // axios 통신에서 에러 응답(4xx, 5xx)이 온 경우 서버 응답 데이터 추출
    let errorDetail = error.message;
    if (error.response && error.response.data) {
      if (typeof error.response.data === 'string') {
        errorDetail = error.response.data; // 보통 XML 형태의 에러 응답이 옴
      } else {
        errorDetail = JSON.stringify(error.response.data);
      }
    }
    
    return res.status(500).json({ 
      error: "정부망 통신 오류 (" + Math.floor(error.response?.status || 500) + ")", 
      detail: errorDetail 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Pet-Pass 백엔드 서버가 시작되었습니다!`);
  console.log(`🌐 주소: http://localhost:${PORT}`);
  console.log(`🔑 상태: 정부 API Key ${process.env.DATA_GO_KR_API_KEY === 'YOUR_GOVERNMENT_API_KEY_HERE' ? '미설정 (모의 응답 작동)' : '적용 완료'}`);
});
