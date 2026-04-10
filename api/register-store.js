const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, type, address } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: "매장명과 주소는 필수 입력 사항입니다." });
  }

  // Supabase가 설정되지 않았을 경우 (개발 모드 또는 설정 누락)
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[WARN] Supabase 환경 변수가 설정되지 않았습니다. 데이터를 저장할 수 없습니다.");
    return res.status(500).json({
      error: "서버 설정 오류 (DB 연결 정보 없음)",
      detail: "관리자에게 문의하거나 Vercel Dashboard에서 SUPABASE 관련 환경 변수를 확인하세요."
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { data, error } = await supabase
      .from('pending_stores')
      .insert([
        {
          name,
          type,
          address,
          status: 'pending',
          submitted_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    res.status(200).json({
      success: true,
      message: "매장 등록 신청이 완료되었습니다. Supabase DB에 안전하게 저장되었습니다."
    });
  } catch (err) {
    console.error("Supabase 저장 에러:", err);
    res.status(500).json({
      error: "데이터베이스 저장 중 오류가 발생했습니다.",
      detail: err.message
    });
  }
};
