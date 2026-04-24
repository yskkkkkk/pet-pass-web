const axios = require('axios');
const { createRateLimiter } = require('../lib/rate-limiter');

const rateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });

const ERROR_MESSAGES = {
  'Unauthorized': 'API 인증키가 존재하지 않거나 유효하지 않습니다.\n공공데이터포털에서 발급받은 인증키 정보를 확인해 주세요.',
  'Forbidden': 'API 서비스에 대한 신청내역이 확인되지 않습니다.\n해당 API의 활용신청 여부와 승인 상태를 확인해 주세요.',
  'API not found': 'API 서비스가 존재하지 않습니다.\n호출 URL에 오타가 없는지, 폐기된 API는 아닌지 확인해 주세요.',
  'Error forwarding request to backend server': '기관 API 서버와의 연결에 실패했습니다.\n일시적인 네트워크 오류일 수 있으니 잠시 후 다시 시도해 주세요.',
  'Error receiving response from backend server': '기관 API 서버로부터 응답을 받지 못했습니다.\n문제가 계속될 경우, 제공기관에 문의바랍니다.',
  'API rate limit exceeded': '현재 많은 사용자가 API를 호출하고 있어, 서버의 최대 동시 요청 수를 초과하였습니다.\n잠시 후 다시 호출해주시기 바랍니다.',
  'API token quota exceeded': 'API 서비스의 일일 호출 허용량을 초과하였습니다.\n초기화된 이후 다시 이용 바랍니다.',
  'Unexpected error': '일시적인 시스템 오류가 발생하였습니다.\n문제가 반복될 경우 활용지원센터로 문의바랍니다.'
};

module.exports = async (req, res) => {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Rate limiting: IP당 분당 10회 초과 시 429 반환
  let proceed = false;
  rateLimiter(req, res, () => { proceed = true; });
  if (!proceed) return;

  const { dogRegNo, ownerBirth, pageNo, numOfRows, ...otherParams } = req.query;
  const API_KEY = process.env.DATA_GO_KR_API_KEY;

  if (!API_KEY || API_KEY === 'YOUR_GOVERNMENT_API_KEY_HERE') {
    return res.status(200).json({
      success: true,
      message: "API Key 미설정 (테스트 모드)",
      data: {
        dogNm: "초코",
        kindNm: "푸들",
        sexNm: "암컷",
        neuterYn: "중성",
        dogRegNo: dogRegNo || '410123456789012',
        ownerBirth: ownerBirth || '900101',
        birthDt: "2024-03-01",
        orgNm: "경기도 성남시",
        officNm: "분당구청",
        vaccinationStatus: "완료 (2026-03-01)"
      }
    });
  }

  try {
    const GOV_API_URL = 'https://apis.data.go.kr/1543061/animalInfoSrvc_v3/animalInfo_v3';

    const params = {
      serviceKey: API_KEY,
      _type: 'json',
      dog_reg_no: dogRegNo,
      rfid_cd: dogRegNo,
      owner_birth: ownerBirth,
      ...otherParams
    };

    if (pageNo) params.pageNo = pageNo;
    if (numOfRows) params.numOfRows = numOfRows;

    const response = await axios.get(GOV_API_URL, {
      params,
      headers: { 'accept': '*/*' }
    });

    // 공공데이터포털 에러 메시지 처리 (바디에 텍스트로 에러가 오는 경우)
    if (typeof response.data === 'string') {
      for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
        if (response.data.includes(key)) {
          return res.status(400).json({ success: false, error: msg });
        }
      }
    }

    let header, body;

    if (typeof response.data === 'string' && response.data.includes('<?xml')) {
      const getValue = (tag) => {
        const match = response.data.match(new RegExp(`<${tag}>(.*?)<\/${tag}>`));
        return match ? match[1] : null;
      };
      header = { resultCode: getValue('resultCode'), resultMsg: getValue('resultMsg') };
      body = { item: {
        dogNm: getValue('dogNm'),
        kindNm: getValue('kindNm'),
        sexNm: getValue('sexNm'),
        neuterYn: getValue('neuterYn'),
        orgNm: getValue('orgNm'),
        birthDt: getValue('birthDt')
      }};
    } else {
      header = response.data?.response?.header;
      body = response.data?.response?.body;
    }

    const isSuccess = header?.resultCode === '00';
    const hasData = body?.item && (body.item.dogNm || Object.keys(body.item).length > 5);

    if (isSuccess) {
      if (!hasData) {
        return res.status(200).json({
          success: false,
          errorTitle: "등록 정보를 확인할 수 없어요",
          error: "국가동물보호관리시스템에 등록된 정보를 가져오지 못했습니다. 번호가 정확한데도 계속 안 된다면, 아직 승인 대기 중일 수 있습니다."
        });
      }

      const petData = { ...body.item };
      petData.dogRegNo = petData.dogRegNo || dogRegNo;
      petData.ownerBirth = petData.ownerBirth || ownerBirth;

      return res.status(200).json({
        success: true,
        message: "국가동물보호정보시스템 인증에 성공하였습니다.",
        data: petData
      });
    } else {
      const errMsg = ERROR_MESSAGES[header?.resultMsg] || header?.resultMsg || "인증 실패";
      return res.status(400).json({
        success: false,
        error: errMsg
      });
    }
  } catch (error) {
    console.error("정부 API 통신 에러:", error.message);
    return res.status(500).json({
      error: "기관 API 서버와의 연결에 실패했습니다.\n일시적인 네트워크 오류일 수 있으니 잠시 후 다시 시도해 주세요."
    });
  }
};
