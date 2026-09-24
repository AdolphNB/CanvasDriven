import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../docs/qrcode.png', import.meta.url);
await mkdir(new URL('../../docs/', import.meta.url), { recursive: true });
await QRCode.toFile(fileURLToPath(output), 'https://canvas.singularitynear.com/qrcode', {
  type: 'png',
  width: 1200,
  margin: 4,
  errorCorrectionLevel: 'M',
  color: { dark: '#000000', light: '#ffffff' },
});
console.log(`QR code saved to ${fileURLToPath(output)}`);
