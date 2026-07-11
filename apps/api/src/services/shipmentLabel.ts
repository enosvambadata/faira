// Rendered as SVG rather than a PDF/PNG library -- no new dependency
// needed at all, since qrCodeUrl is already a data: URL (generated at
// confirmation, SCRUM-135) that can be embedded directly as an <image>.
// Browsers print SVG natively, which is all a pilot-scale hub-ops screen
// needs; a real label-printer integration (ZPL, etc.) is future work.
export interface ShipmentLabelData {
  reference: string;
  qrCodeUrl: string;
  originHubName: string;
  destinationHubName: string;
  sizeTier: string;
  declaredValue: string;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderShipmentLabelSvg(data: ShipmentLabelData): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect x="1" y="1" width="398" height="258" fill="#ffffff" stroke="#000000" stroke-width="2"/>
  <text x="16" y="28" font-family="monospace" font-size="20" font-weight="bold">${escapeXml(data.reference)}</text>
  <image x="16" y="40" width="130" height="130" href="${data.qrCodeUrl}"/>
  <text x="160" y="60" font-family="sans-serif" font-size="14">From: ${escapeXml(data.originHubName)}</text>
  <text x="160" y="84" font-family="sans-serif" font-size="14">To: ${escapeXml(data.destinationHubName)}</text>
  <text x="160" y="108" font-family="sans-serif" font-size="14">Size: ${escapeXml(data.sizeTier)}</text>
  <text x="160" y="132" font-family="sans-serif" font-size="14">Declared value: $${escapeXml(data.declaredValue)}</text>
  <text x="16" y="200" font-family="sans-serif" font-size="11" fill="#666666">Faira Fulfilment</text>
</svg>`;
}
