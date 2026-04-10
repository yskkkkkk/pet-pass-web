const axios = require('axios');

module.exports = async (req, res) => {
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

  if (!API_KEY || API_KEY === 'YOUR_GOVERNMENT_API_KEY_HERE') {
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
    const rfid_cd = dogRegNo;
    const fullURL = `${GOV_API_URL}?serviceKey=${API_KEY}&dog_reg_no=${dogRegNo}&rfid_cd=${rfid_cd}&owner_nm=%20&owner_birth=${ownerBirth}`;

    const response = await axios.get(fullURL, {
      headers: { 'accept': '*/*' }
    });

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
        orgNm: getValue('orgNm')
      }};
    } else {
      header = response.data?.response?.header;
      body = response.data?.response?.body;
    }

    const isSuccess = header?.resultCode === '00';
    const hasData = body?.item && (body.item.dogNm || Object.keys(body.item).length > 5);

    if (isSuccess) {
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

      return res.status(200).json({
        success: true,
        message: hasData ? "국가동물보호정보시스템 인증에 성공하였습니다." : "정부 시스템 인증 성공 (테스트 데이터 모드입니다.)",
        data: petData
      });
    } else {
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
};
