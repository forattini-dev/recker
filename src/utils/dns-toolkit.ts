import { promises as dns } from 'node:dns';

export interface DnsSecurityRecords {
  spf?: string[];
  dmarc?: string;
  caa?: { issue?: string[]; issuewild?: string[]; iodef?: string };
  mx?: string[];
  txt?: string[];
}

export async function getSecurityRecords(domain: string): Promise<DnsSecurityRecords> {
  const results: DnsSecurityRecords = { txt: [] };

  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flatTxt = txtRecords.map(chunks => chunks.join(''));
    results.txt = flatTxt;

    // Parse SPF
    results.spf = flatTxt.filter(txt => txt.startsWith('v=spf1'));

    // Parse DMARC (needs _dmarc subdomain)
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcTxt = dmarcRecords.map(chunks => chunks.join(''))[0]; // Usually only one
      if (dmarcTxt && dmarcTxt.startsWith('v=DMARC1')) {
        results.dmarc = dmarcTxt;
      }
    } catch {
      // No DMARC
    }

    // Parse CAA
    try {
      const caaRecords = await dns.resolveCaa(domain);
      results.caa = {};
      caaRecords.forEach(r => {
        if (!results.caa![r.issue as keyof typeof results.caa]) {
             // Initialize array if needed (issue/issuewild are likely arrays, iodef is single)
             // CAA record type in Node: { critical: number, issue?: string, ... }
             // Actually property is the tag.
             // Node.js return type is { critical: number, issue?: string, issuewild?: string, iodef?: string, contactemail?: string, ... }
             // But multiple records can exist.
        }
        
        // Map manually
        if ((r as any).issue) {
            results.caa!.issue = [...(results.caa!.issue || []), (r as any).issue];
        }
        if ((r as any).issuewild) {
            results.caa!.issuewild = [...(results.caa!.issuewild || []), (r as any).issuewild];
        }
        if ((r as any).iodef) {
            results.caa!.iodef = (r as any).iodef;
        }
      });
    } catch {
      // No CAA
    }

    // Get MX
    try {
        const mx = await dns.resolveMx(domain);
        results.mx = mx.map(r => r.exchange);
    } catch {
        // No MX
    }

  } catch (error) {
    throw new Error(`Failed to resolve DNS for ${domain}: ${error}`);
  }

  return results;
}
