import * as T from 'three';

/** Small original procedural atlases: detail stays in pixels, not dozens of meshes. */
export function tankTexture(name: string, width: number, height: number, draw: (c: CanvasRenderingContext2D) => void): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d'); if (context) draw(context);
  const texture = new T.CanvasTexture(canvas); texture.name = name; texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
export function tankGrilleTexture(): T.CanvasTexture {
  return tankTexture('Tank five-bar grille / badge atlas', 1024, 512, c => {
    c.fillStyle = '#0b1115'; c.fillRect(0, 0, 1024, 512);
    for (let x = 24; x < 1024; x += 24) { c.fillStyle = '#263136'; c.fillRect(x, 24, 3, 464); }
    for (let n = 0; n < 5; n++) {
      const y = 34 + n * 96, chrome = c.createLinearGradient(0, y, 0, y + 48);
      chrome.addColorStop(0, '#77858a'); chrome.addColorStop(.22, '#e9eeec'); chrome.addColorStop(.45, '#9ca6a8'); chrome.addColorStop(.7, '#45535b'); chrome.addColorStop(1, '#c1c9c9');
      c.fillStyle = chrome; c.fillRect(15, y, 994, 48); c.fillStyle = '#1b242a'; c.fillRect(15, y + 48, 994, 12);
    }
    c.fillStyle = '#aebbbc'; c.fillRect(450, 130, 124, 225); c.fillStyle = '#25353b'; c.fillRect(463, 143, 98, 200);
    c.fillStyle = '#e0e6e4'; c.fillRect(478, 159, 69, 20); c.fillRect(501, 179, 23, 65); c.fillRect(478, 244, 69, 20); c.fillRect(478, 264, 23, 58); c.fillRect(524, 264, 23, 58);
  });
}
export function tankLensTexture(): T.CanvasTexture {
  return tankTexture('Tank dark optical modules atlas', 512, 256, c => {
    c.fillStyle = '#111e27'; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 3; i++) {
      const x = 98 + i * 155, fill = c.createRadialGradient(x - 12, 115, 5, x, 128, 65);
      fill.addColorStop(0, '#afc4cf'); fill.addColorStop(.3, '#5b7584'); fill.addColorStop(.65, '#172630'); fill.addColorStop(.85, '#8b9ca4'); fill.addColorStop(1, '#101a22');
      c.fillStyle = fill; c.beginPath(); c.arc(x, 128, 65, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#a7b3ba'; c.lineWidth = 4; c.strokeRect(8, 10, 496, 236);
  });
}
export function tankCabinTexture(quilt = false): T.CanvasTexture {
  return tankTexture(quilt ? 'Tank quilted seat upholstery' : 'Tank fine leather grain', 512, 512, c => {
    c.fillStyle = '#b8a99a'; c.fillRect(0, 0, 512, 512);
    // Deterministic grain; no costly geometry or per-frame texture regeneration.
    for (let i = 0; i < 7000; i++) { const x = (i * 73 + i * i * 7) % 512, y = (i * 139 + i * i * 3) % 512;
      c.fillStyle = i % 2 ? '#a99a8c' : '#c5b6a6'; c.fillRect(x, y, 1.2, .7); }
    c.strokeStyle = '#8d7a69'; c.lineWidth = 1;
    if (quilt) for (let x = -512; x < 1024; x += 128) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 512, 512); c.stroke(); c.beginPath(); c.moveTo(x, 512); c.lineTo(x + 512, 0); c.stroke(); }
  });
}
export function tankControlsTexture(): T.CanvasTexture {
  return tankTexture('Tank vents / clock / console legends', 1024, 512, c => {
    c.fillStyle = '#182126'; c.fillRect(0, 0, 1024, 512);
    for (const x of [12, 570]) for (let n = 0; n < 7; n++) { c.fillStyle = n === 3 ? '#bbc0bc' : '#617076'; c.fillRect(x, 16 + n * 25, 430, 8); }
    c.fillStyle = '#bcc2bb'; c.beginPath(); c.arc(512, 105, 64, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#10171a'; c.beginPath(); c.arc(512, 105, 57, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e1d6c0'; c.lineWidth = 5; c.beginPath(); c.moveTo(512, 105); c.lineTo(512, 63); c.moveTo(512, 105); c.lineTo(548, 117); c.stroke();
    c.font = '500 26px Segoe UI, sans-serif'; c.fillStyle = '#cdd7d8'; c.textAlign = 'center';
    ['AUTO', '−', 'TEMP', '+', 'A/C', 'FRONT', 'REAR'].forEach((s, i) => c.fillText(s, 80 + i * 144, 264));
    c.fillStyle = '#0a1115'; c.fillRect(25, 310, 974, 182);
    c.fillStyle = '#cdd7d8';
    ['4H', '4L', 'DRIVE MODE', 'P', 'AUTO HOLD', 'Hi4-T'].forEach((s, i) => c.fillText(s, 90 + i * 165, 420));
  });
}
