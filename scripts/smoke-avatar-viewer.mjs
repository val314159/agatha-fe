import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.AVATAR_VIEWER_URL || 'http://localhost:5173/';
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';

const checks = [
  {
    name: 'desktop-vrm',
    model: '/models/avaAvatar.vrm',
    viewport: { width: 1280, height: 900 },
  },
  {
    name: 'mobile-gltf',
    model: '/models/cube.gltf',
    viewport: { width: 390, height: 844 },
  },
];

await mkdir('.tmp', { recursive: true });

const browser = await chromium.launch({
  executablePath,
  args: ['--no-sandbox', '--disable-gpu'],
});

try {
  for (const check of checks) {
    await runCheck(browser, check);
  }
} finally {
  await browser.close();
}

async function runCheck(browser, check) {
  const page = await browser.newPage({
    viewport: check.viewport,
    deviceScaleFactor: 1,
  });

  page.on('pageerror', (error) => {
    throw error;
  });

  const url = new URL(baseUrl);
  url.searchParams.set('model', check.model);

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#model-state[data-tone="ready"]', {
    timeout: 45000,
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return canvas && canvas.width > 0 && canvas.height > 0;
  });

  await page.screenshot({
    path: `.tmp/avatar-viewer-${check.name}.png`,
    fullPage: true,
  });

  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const meshText = document.querySelector('#meta-meshes')?.textContent || '0';
    const triangleText = document.querySelector('#meta-triangles')?.textContent || '0';
    const meshes = Number(meshText.replaceAll(',', ''));
    const triangles = Number(triangleText.replaceAll(',', ''));

    if (!gl) {
      return { ok: false, reason: 'missing WebGL context', meshes, triangles };
    }

    const width = canvas.width;
    const height = canvas.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    const colors = new Set();
    let alphaPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) {
        alphaPixels += 1;
      }
      if (colors.size < 512) {
        colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${pixels[i + 3]}`);
      }
    }

    return {
      ok: meshes > 0 && triangles > 0 && alphaPixels > 1000 && colors.size > 8,
      width,
      height,
      meshes,
      triangles,
      alphaPixels,
      colors: colors.size,
    };
  });

  await page.close();

  if (!result.ok) {
    throw new Error(`${check.name} failed: ${JSON.stringify(result)}`);
  }

  console.log(`${check.name} ok`, result);
}
