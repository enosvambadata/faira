import { describe, it, expect, vi } from 'vitest';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { generateShipmentReference } from './shipmentReference';

function fakeTx(sequenceAfterIncrement: number, code = 'HRE') {
  return {
    hub: {
      update: vi.fn().mockResolvedValue({ id: 'hub-1', code, nextShipmentSequence: sequenceAfterIncrement }),
    },
  } as unknown as Parameters<typeof generateShipmentReference>[0];
}

describe('generateShipmentReference', () => {
  it('formats a human-readable reference from the hub code and post-increment sequence', async () => {
    const tx = fakeTx(2, 'HRE');

    const result = await generateShipmentReference(tx, 'hub-1');

    expect(result.reference).toBe('FF-HRE-000001');
  });

  it('pads the sequence to 6 digits', async () => {
    const tx = fakeTx(123457, 'BUL');

    const result = await generateShipmentReference(tx, 'hub-1');

    expect(result.reference).toBe('FF-BUL-123456');
  });

  it('atomically increments the hub sequence via a single update', async () => {
    const tx = fakeTx(2);

    await generateShipmentReference(tx, 'hub-1');

    expect(tx.hub.update).toHaveBeenCalledWith({
      where: { id: 'hub-1' },
      data: { nextShipmentSequence: { increment: 1 } },
    });
  });

  it('generates a QR code data URL that encodes the reference', async () => {
    const tx = fakeTx(2, 'HRE');

    const result = await generateShipmentReference(tx, 'hub-1');

    expect(result.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('QR code decodes back to the exact reference string', async () => {
    const tx = fakeTx(457, 'BUL');

    const result = await generateShipmentReference(tx, 'hub-1');

    const pngBuffer = Buffer.from(result.qrCodeUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const png = PNG.sync.read(pngBuffer);
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

    expect(decoded?.data).toBe(result.reference);
    expect(decoded?.data).toBe('FF-BUL-000456');
  });
});
