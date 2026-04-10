const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const filePath = path.join(process.cwd(), 'data', 'stores.json');

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const stores = JSON.parse(data);
    res.status(200).json(stores);
  } catch (err) {
    console.error("매장 데이터를 읽는 중 오류 발생:", err);
    res.status(500).json({ error: "매장 데이터를 불러올 수 없습니다." });
  }
};
