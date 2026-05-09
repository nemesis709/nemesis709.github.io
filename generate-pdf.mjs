import puppeteer from 'puppeteer';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const chunks = [];
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location).then(resolve).catch(reject);
      }
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function getFontCSS() {
  console.log('Noto Sans KR 폰트 다운로드 중...');
  const cssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap';
  const cssBuffer = await download(cssUrl);
  const cssText = cssBuffer.toString('utf-8');
  const woff2Matches = [...cssText.matchAll(/src:\s*url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/g)];
  const urls = [...new Set(woff2Matches.map(m => m[1]))];
  let processedCSS = cssText;
  for (const url of urls) {
    console.log(`  다운로드: ${url.split('/').pop()}`);
    const fontBuffer = await download(url);
    const base64 = fontBuffer.toString('base64');
    processedCSS = processedCSS.split(url).join(`data:font/woff2;base64,${base64}`);
  }
  return processedCSS;
}

async function buildStandaloneHTML(htmlFile, fontCSS) {
  const htmlPath = resolve(__dirname, htmlFile);
  let html = readFileSync(htmlPath, 'utf-8');

  const isFormalResume = htmlFile === 'me.html';
  const sharedCSS = isFormalResume ? '' : readFileSync(resolve(__dirname, 'shared.css'), 'utf-8');
  const pageCSS = readFileSync(resolve(__dirname, htmlFile.replace('.html', '.css')), 'utf-8');

  // img src를 base64로 임베드
  const htmlImgMatches = [...html.matchAll(/src=['"](\.\/[^'"]+)['"]/g)];
  for (const match of htmlImgMatches) {
    const absPath = resolve(__dirname, match[1].replace('./', ''));
    if (existsSync(absPath)) {
      const ext = absPath.split('.').pop().toLowerCase();
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : 'image/jpeg';
      const b64 = readFileSync(absPath).toString('base64');
      html = html.split(match[0]).join(`src="data:${mime};base64,${b64}"`);
    }
  }

  const isPortfolio = htmlFile === 'portfolio.html';
  const contentWidth = isPortfolio ? 1120 : 860;

  const printCSS = isFormalResume ? `
    @page { size: A4; margin: 17mm 18mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { width: auto !important; font-family: "Noto Sans KR", sans-serif !important; }
    a { border-bottom: none !important; text-decoration: none !important; }
  ` : `
    @page { size: ${isPortfolio ? 'A4 landscape' : 'A4'}; margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    html, body { font-family: "Noto Sans KR", sans-serif !important; width: ${contentWidth}px !important; }
    .page { width: ${contentWidth}px !important; max-width: ${contentWidth}px !important; }
    a { border-bottom: none !important; text-decoration: none !important; }
    .icon-link { border: 1px solid #e5e5e5 !important; }
  `;

  const standaloneCSS = `<style>${fontCSS}${sharedCSS}${pageCSS}${printCSS}</style>`;

  html = html
    .replace(/<link[^>]*rel="preconnect"[^>]*>/g, '')
    .replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '')
    .replace(/<link[^>]*fonts\.gstatic[^>]*>/g, '')
    .replace(/<link[^>]*shared\.css[^>]*>/g, '')
    .replace(/<link[^>]*me\.css[^>]*>/g, '')
    .replace(/<link[^>]*portfolio\.css[^>]*>/g, '')
    .replace(/<link[^>]*resume\.css[^>]*>/g, '')
    .replace(/<script[^>]*src[^>]*><\/script>/g, '')
    .replace('</head>', `${standaloneCSS}\n</head>`);

  return html;
}

async function main() {
  const fontCSS = await getFontCSS();
  console.log('폰트 CSS 준비 완료');

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    for (const file of ['me.html', 'portfolio.html', 'resume.html']) {
      const outName = file.replace('.html', '.pdf');
      console.log(`\n${file} → ${outName} 변환 중...`);

      const isFormalResume = file === 'me.html';
      const isPortfolio = file === 'portfolio.html';
      const contentWidth = isPortfolio ? 1120 : isFormalResume ? 794 : 860;
      const standaloneHTML = await buildStandaloneHTML(file, fontCSS);

      const page = await browser.newPage();
      await page.setViewport({ width: contentWidth, height: 1080, deviceScaleFactor: 2 });
      await page.setContent(standaloneHTML, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(r => setTimeout(r, 500));

      const pdfPath = resolve(__dirname, outName);

      if (isFormalResume) {
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
          preferCSSPageSize: true,
        });
      } else if (isPortfolio) {
        // landscape A4(297mm) 좌우 여백 20mm씩 → 가용 1047px
        const scale = 1047 / contentWidth;
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          scale,
          margin: { top: '14mm', right: '20mm', bottom: '14mm', left: '20mm' },
        });
      } else {
        // portrait A4(210mm) 좌우 여백 16mm씩 → 가용 748px
        const scale = 748 / contentWidth;
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          scale,
          margin: { top: '14mm', right: '16mm', bottom: '14mm', left: '16mm' },
        });
      }

      await page.close();
      console.log(`  완료: ${pdfPath}`);
    }
  } finally {
    await browser.close();
  }

  console.log('\n모든 PDF 생성 완료!');
}

main().catch(err => { console.error(err); process.exit(1); });
