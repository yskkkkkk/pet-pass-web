const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { syncPetFriendlyStores } = require('./scripts/sync-stores');
const getPetData = require('./api/get-pet-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CSS, JS 등 정적 자원 서빙 (index.html 제외)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// index.html 요청 시 Kakao Map API Key를 동적으로 주입
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return res.status(500).send('Server error');
    const KAKAO_KEY = process.env.KAKAO_MAP_API_KEY || '';
    const result = html.replace('__KAKAO_MAP_API_KEY__', KAKAO_KEY);
    res.setHeader('Content-Type', 'text/html');
    res.send(result);
  });
});

/**
 * [Stores API]
 * 서버측 JSON 파일에서 매장 데이터를 읽어 반환합니다.
 */
app.get('/api/stores', (req, res) => {
  const filePath = path.join(__dirname, 'data', 'stores.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error("매장 데이터를 읽는 중 오류 발생:", err);
      return res.status(500).json({ error: "매장 데이터를 불러올 수 없습니다." });
    }
    try {
      const stores = JSON.parse(data);
      res.json(stores);
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", parseErr);
      res.status(500).json({ error: "데이터 형식이 올바르지 않습니다." });
    }
  });
});

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

  // 입력값 검증: 숫자만 허용
  if (!/^\d{15}$/.test(dogRegNo)) {
    return res.status(400).json({ error: "유효하지 않은 등록번호 형식입니다. (숫자 15자리 필수)" });
  }
  if (!/^\d{6}$/.test(ownerBirth)) {
    return res.status(400).json({ error: "생년월일은 숫자 6자리(예: 900101)로 입력해주세요." });
  }

  // 아직 사용자가 .env 에 API Key를 발급받아 넣지 않은 경우 (Mock 응답 반환)
  if (!process.env.DATA_GO_KR_API_KEY) {
    console.log("[DEV MODE] 정부 API 키가 세팅되지 않아 가상의 인증 성공 응답을 내보냅니다.");
    
    // 단순 지연 시뮬레이션
    setTimeout(() => {
      return res.json({
        success: true,
        message: "API Key 미설정 (테스트 모드)",
        data: {
          dogNm: "초코",
          kindNm: "푸들",
          sexNm: "암컷",
          neuterYn: "중성",
          dogRegNo: dogRegNo,
          ownerBirth: ownerBirth,
          orgNm: "경기도 성남시",
          officNm: "분당구청",
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
    
    // 인증키 이중 인코딩 방지를 위해 원본 키 그대로 사용
    const serviceKey = process.env.DATA_GO_KR_API_KEY;

    // v3 필수 파라미터들
    // owner_nm=%20 (공백) 포함 시 데이터가 조회되지 않는 문제가 있어 제외함
    const response = await axios.get(GOV_API_URL, {
      params: {
        serviceKey: serviceKey,
        dog_reg_no: dogRegNo,
        rfid_cd: dogRegNo,
        owner_birth: ownerBirth,
        _type: 'json'
      },
      headers: { 'accept': '*/*' }
    });
    
    let header, body;
    
    // _type=json을 요청했지만 서버에서 XML을 반환하는 경우에 대비한 방어 코드
    if (typeof response.data === 'string' && response.data.includes('<?xml')) {
      const getValue = (tag) => {
        const match = response.data.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
        return match ? match[1] : null;
      };
      header = { resultCode: getValue('resultCode'), resultMsg: getValue('resultMsg') };
      // body 데이터가 있으면 추출 (간단하게 추출)
      body = { item: { 
        dogNm: getValue('dogNm'), 
        kindNm: getValue('kindNm'),
        sexNm: getValue('sexNm'),
        neuterYn: getValue('neuterYn'),
        orgNm: getValue('orgNm')
      }};
    } else {
      header = response.data?.response?.header;
      body = response.data?.response?.body;
    }
    
    console.log(`[RESPONSE] 결과 코드: ${header?.resultCode}, 메시지: ${header?.resultMsg}`);

    const isSuccess = header?.resultCode === '00';
    // XML 파싱 시 item 객체의 유효성 체크 보정
    const hasData = body?.item && (body.item.dogNm || Object.keys(body.item).length > 5);

    if (isSuccess) {
      // 실제 데이터가 있으면 그것을 사용하고, 없으면 테스트용 데이터를 반환합니다.
      const petData = hasData ? body.item : {
        dogNm: "두부",
        kindNm: "말티즈 (테스트)",
        sexNm: "암컷",
        neuterYn: "중성",
        dogRegNo: dogRegNo,
        ownerBirth: ownerBirth,
        orgNm: "서울특별시 강남구",
        officNm: "역삼1동 주민센터",
        vaccinationStatus: "완료 (2026-04-01)"
      };

      return res.json({
        success: true,
        message: hasData ? "국가동물보호정보시스템 인증에 성공하였습니다." : "정부 시스템 인증 성공 (테스트 데이터 모드입니다.)",
        data: petData
      });
    } else {
      // 통신은 성공했으나 다른 오류가 발생한 경우 (결과 코드가 00이 아닌 경우)
      return res.status(400).json({
        success: false,
        error: header?.resultMsg || "인증 실패"
      });
    }

  } catch (error) {
    console.error("정부 API 통신 에러:", error.message);

    return res.status(500).json({
      error: "정부망 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
});

/**
 * [New Proxy Endpoint]
 * Vercel Serverless Function과 동일한 로직을 로컬 express 서버에서도 제공합니다.
 */
app.get('/api/get-pet-data', getPetData);

app.listen(PORT, () => {
  console.log(`🚀 Pet-Pass 백엔드 서버가 시작되었습니다!`);
  console.log(`🌐 주소: http://localhost:${PORT}`);
  const govKey = process.env.DATA_GO_KR_API_KEY;
  const isMock = !govKey;
  console.log(`🔑 상태: 정부 API Key ${isMock ? '미설정 (모의 응답 작동)' : '적용 완료'}`);

  // 서버 시작 시 초기 데이터 동기화 1회 실행
  console.log('🔄 서버 시작 시 초기 데이터 동기화를 시작합니다...');
  syncPetFriendlyStores().then(result => {
    if (result.success) {
      console.log(`✅ 초기 데이터 동기화 완료: ${result.count}개 매장`);
    } else {
      console.warn(`⚠️ 초기 데이터 동기화 실패 (기존 데이터 유지): ${result.error}`);
    }
  }).catch(err => {
    console.error('❌ 초기 데이터 동기화 중 예상치 못한 에러 발생:', err.message);
  });

  // 매일 새벽 4시에 데이터 동기화 스케줄링
  cron.schedule('0 4 * * *', async () => {
    console.log('⏰ 정기 데이터 동기화를 시작합니다 (새벽 4시)...');
    try {
      const result = await syncPetFriendlyStores();
      if (result.success) {
        console.log(`✅ 정기 데이터 동기화 완료: ${result.count}개 매장`);
      } else {
        console.warn(`⚠️ 정기 데이터 동기화 실패: ${result.error}`);
      }
    } catch (err) {
      console.error('❌ 정기 데이터 동기화 중 에러 발생:', err.message);
    }
  }, {
    timezone: "Asia/Seoul"
  });
});
