const axios = require('axios');
const { parsePetResponse, hasPetData, NO_DATA } = require('../lib/pet-response');
const { createRateLimiter } = require('../lib/rate-limiter');

const rateLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });

module.exports = async (req, res) => {
  // Rate limiting: IP당 분당 10회 초과 시 429 반환
  let proceed = false;
  rateLimiter(req, res, () => { proceed = true; });
  if (!proceed) return;

  const { dogRegNo, ownerBirth } = req.query;

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

  const API_KEY = process.env.DATA_GO_KR_API_KEY;

  if (!API_KEY) {
    console.log("[DEV MODE] 정부 API 키가 세팅되지 않아 가상의 인증 성공 응답을 내보냅니다.");

    // Mock response
    return res.status(200).json({
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
  }

  try {
    const GOV_API_URL = 'https://apis.data.go.kr/1543061/animalInfoSrvc_v3/animalInfo_v3';
    // v3 API에서는 dog_reg_no 또는 rfid_cd 중 하나만 있어도 되지만,
    // 둘 다 보내는 것이 안전하며 owner_nm은 데이터가 없는 경우 조회가 안 될 수 있으므로 제외합니다.
    const response = await axios.get(GOV_API_URL, {
      params: {
        serviceKey: API_KEY,
        dog_reg_no: dogRegNo,
        rfid_cd: dogRegNo,
        owner_birth: ownerBirth,
        _type: 'json'
      },
      headers: { 'accept': '*/*' }
    });

    // XML/JSON을 같은 모양으로 맞추고, "성공 코드"와 "등록 정보 있음"을 따로 확인한다
    // (조회 결과가 없어도 성공 코드가 온다 — 그때 테스트 동물로 대신하지 않는다)
    const { resultCode, resultMsg, item } = parsePetResponse(response.data);

    if (resultCode === '00') {
      if (!hasPetData(item)) return res.status(200).json(NO_DATA);
      return res.status(200).json({
        success: true,
        message: "국가동물보호정보시스템 인증에 성공하였습니다.",
        data: { ...item, dogRegNo: item.dogRegNo || dogRegNo, ownerBirth }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: resultMsg || "인증 실패"
      });
    }
  } catch (error) {
    console.error("정부 API 통신 에러:", error.message);
    return res.status(500).json({
      error: "정부망 통신 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    });
  }
};
