const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', '반려동물_동반가능_업소현황(2026.4.9 8시42분 기준).xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

console.log('총 행 수:', rows.length);
console.log('첫번째 행 키:', Object.keys(rows[0]));
console.log('첫번째 행 샘플:', JSON.stringify(rows[0], null, 2));
console.log('두번째 행 샘플:', JSON.stringify(rows[1], null, 2));
