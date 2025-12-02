import { describe, it, expect } from 'vitest';

describe('UDP Module Exports', () => {
  it('should export UDPTransport', async () => {
    const { UDPTransport } = await import('../../src/udp/index.js');
    expect(UDPTransport).toBeDefined();
  });

  it('should export UDPClient', async () => {
    const { UDPClient } = await import('../../src/udp/index.js');
    expect(UDPClient).toBeDefined();
  });

  it('should export createUDP', async () => {
    const { createUDP } = await import('../../src/udp/index.js');
    expect(createUDP).toBeDefined();
    expect(typeof createUDP).toBe('function');
  });

  it('should export udp helper', async () => {
    const { udp } = await import('../../src/udp/index.js');
    expect(udp).toBeDefined();
    expect(typeof udp.send).toBe('function');
    expect(typeof udp.broadcast).toBe('function');
    expect(typeof udp.discover).toBe('function');
  });

  it('should export UDPResponseWrapper', async () => {
    const { UDPResponseWrapper } = await import('../../src/udp/index.js');
    expect(UDPResponseWrapper).toBeDefined();
  });

  it('should export StreamingUDPResponse', async () => {
    const { StreamingUDPResponse } = await import('../../src/udp/index.js');
    expect(StreamingUDPResponse).toBeDefined();
  });

  it('should export BaseUDPTransport', async () => {
    const { BaseUDPTransport } = await import('../../src/udp/index.js');
    expect(BaseUDPTransport).toBeDefined();
  });

  it('should export udpRequestStorage', async () => {
    const { udpRequestStorage } = await import('../../src/udp/index.js');
    expect(udpRequestStorage).toBeDefined();
  });
});
