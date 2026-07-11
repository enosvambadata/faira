import { describe, it, expect } from 'vitest';
import { renderShipmentLabelSvg } from './shipmentLabel';

describe('renderShipmentLabelSvg', () => {
  it('includes the reference, QR image, hubs, size tier, and declared value', () => {
    const svg = renderShipmentLabelSvg({
      reference: 'FF-HRE-000001',
      qrCodeUrl: 'data:image/png;base64,abc123',
      originHubName: 'Faira Harare Hub',
      destinationHubName: 'Faira Bulawayo Hub',
      sizeTier: 'MEDIUM',
      declaredValue: '100.00',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('FF-HRE-000001');
    expect(svg).toContain('href="data:image/png;base64,abc123"');
    expect(svg).toContain('Faira Harare Hub');
    expect(svg).toContain('Faira Bulawayo Hub');
    expect(svg).toContain('MEDIUM');
    expect(svg).toContain('$100.00');
  });

  it('escapes XML-unsafe characters in text fields', () => {
    const svg = renderShipmentLabelSvg({
      reference: 'FF-HRE-000001',
      qrCodeUrl: 'data:image/png;base64,abc123',
      originHubName: 'Hub <A> & "B"',
      destinationHubName: 'Hub 2',
      sizeTier: 'SMALL',
      declaredValue: '10',
    });

    expect(svg).toContain('Hub &lt;A&gt; &amp; &quot;B&quot;');
    expect(svg).not.toContain('Hub <A>');
  });
});
