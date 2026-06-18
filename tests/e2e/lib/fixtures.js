/**
 * Lightweight fixture builders so the harness doesn't need to ship binary blobs.
 *
 * - pdfBuffer(): a 4-byte minimal PDF magic header is enough to make mime-detection
 *   recognise application/pdf for most parsers. The API stores raw bytes and only
 *   checks the declared / sniffed mime, not full structure.
 * - pngBuffer(): real 1x1 transparent PNG.
 * - csvBuffer(): UTF-8 CSV string buffer.
 * - txtBuffer(): plain text.
 * - oversizedBuffer(): >50MB.
 */

const PNG_1x1 = Buffer.from(
  '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C636200010000050001' +
    '0D0A2DB40000000049454E44AE426082',
  'hex',
);

function pdfBuffer(label = 'e2e') {
  // Minimal valid-looking PDF (header + EOF). The API uses file-type sniffing
  // via fast-magic-bytes; %PDF- is enough.
  const body =
    '%PDF-1.4\n' +
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n' +
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n' +
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj\n' +
    `% ${label}\n` +
    'xref\n0 4\n0000000000 65535 f \ntrailer << /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF\n';
  return Buffer.from(body, 'utf8');
}

function xlsxBuffer() {
  // Minimal ZIP central directory — XLSX sniffers usually identify PK\x03\x04.
  // We return a tiny placeholder ZIP-shaped buffer; if the API rejects this
  // due to schema parsing, the test will record that defect.
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00]);
}

function csvBuffer(rows = [['col1', 'col2'], ['a', '1']]) {
  return Buffer.from(rows.map(r => r.join(',')).join('\n') + '\n', 'utf8');
}

function txtBuffer(text = 'hello e2e\n') {
  return Buffer.from(text, 'utf8');
}

function pngBuffer() {
  return PNG_1x1;
}

function oversizedBuffer() {
  // 51 MB of zeros
  return Buffer.alloc(51 * 1024 * 1024, 0);
}

function uniquePrefix() {
  return `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

module.exports = {
  pdfBuffer,
  xlsxBuffer,
  csvBuffer,
  txtBuffer,
  pngBuffer,
  oversizedBuffer,
  uniquePrefix,
};
