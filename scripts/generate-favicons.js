const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'public', 'favicon-source.png');
const OUTPUT_DIR = path.join(__dirname, '..', 'public');

const SIZES = [512, 192, 180, 32, 16];

async function generateFavicons() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Load image content as base64
  const imageBuffer = fs.readFileSync(SOURCE_PATH);
  const base64Image = imageBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;

  // Set content directly to ensure proper rendering without background
  await page.setContent(`
    <style>
      body, html { margin: 0; padding: 0; overflow: hidden; background: transparent; }
      img { display: block; width: 100vw; height: 100vh; object-fit: contain; }
    </style>
    <img src="${dataUri}" />
  `);

  for (const size of SIZES) {
    console.log(`Generating ${size}x${size} PNG...`);
    await page.setViewportSize({ width: size, height: size });
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `favicon-${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size }
    });
  }

  await browser.close();

  // Special cases for specific names
  fs.copyFileSync(path.join(OUTPUT_DIR, 'favicon-512.png'), path.join(OUTPUT_DIR, 'android-chrome-512x512.png'));
  fs.copyFileSync(path.join(OUTPUT_DIR, 'favicon-192.png'), path.join(OUTPUT_DIR, 'android-chrome-192x192.png'));
  fs.copyFileSync(path.join(OUTPUT_DIR, 'favicon-180.png'), path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
  fs.copyFileSync(path.join(OUTPUT_DIR, 'favicon-32.png'), path.join(OUTPUT_DIR, 'favicon-32x32.png'));
  fs.copyFileSync(path.join(OUTPUT_DIR, 'favicon-16.png'), path.join(OUTPUT_DIR, 'favicon-16x16.png'));

  console.log('Generating favicon.ico via CLI...');
  const { execSync } = require('child_process');
  // Using npx png-to-ico to avoid ESM import issues in CommonJS script
  execSync(`npx png-to-ico public/favicon-32.png public/favicon-16.png > public/favicon.ico`, { stdio: 'inherit' });

  console.log('✅ All favicons generated successfully!');
}

generateFavicons().catch(err => {
  console.error('❌ Error generating favicons:', err);
  process.exit(1);
});
