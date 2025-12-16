import { promises as dns } from 'node:dns';
import colors from '../../../utils/colors.js';
import { getSecurityRecords } from '../../../utils/dns-toolkit.js';
import { ShellContext } from './context.js';

export async function runDns(ctx: ShellContext, domain?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns <domain>'));
      console.log(colors.gray('  Examples: dns google.com | dns github.com'));
      console.log(colors.gray('  Or set a base URL first: url https://example.com'));
      return;
    }
  }

  console.log(colors.gray(`Resolving DNS for ${domain}...`));
  const startTime = performance.now();

  try {
    // Parallel DNS lookups
    const [a, aaaa, mx, ns, txt, security] = await Promise.all([
      dns.resolve4(domain).catch(() => []),
      dns.resolve6(domain).catch(() => []),
      dns.resolveMx(domain).catch(() => []),
      dns.resolveNs(domain).catch(() => []),
      dns.resolveTxt(domain).catch(() => []),
      getSecurityRecords(domain).catch(() => ({}))
    ]);

    const duration = Math.round(performance.now() - startTime);
    console.log(colors.green(`✔ DNS resolved`) + colors.gray(` (${duration}ms)
`));

    // A Records
    if (a.length) {
      console.log(colors.bold('  A Records (IPv4):'));
      a.forEach(ip => console.log(`    ${colors.cyan('→')} ${ip}`));
    }

    // AAAA Records
    if (aaaa.length) {
      console.log(colors.bold('  AAAA Records (IPv6):'));
      aaaa.forEach(ip => console.log(`    ${colors.cyan('→')} ${ip}`));
    }

    // NS Records
    if (ns.length) {
      console.log(colors.bold('  NS Records:'));
      ns.forEach(n => console.log(`    ${colors.cyan('→')} ${n}`));
    }

    // MX Records
    if (mx.length) {
      console.log(colors.bold('  MX Records:'));
      mx.sort((a, b) => a.priority - b.priority)
        .forEach(m => console.log(`    ${colors.cyan(String(m.priority).padStart(3))} ${m.exchange}`));
    }

    // Security Records
    const sec = security as any;
    if (sec.spf?.length) {
      console.log(colors.bold('  SPF:'));
      console.log(`    ${colors.gray(sec.spf[0].slice(0, 80))}${sec.spf[0].length > 80 ? '...' : ''}`);
    }
    if (sec.dmarc) {
      console.log(colors.bold('  DMARC:'));
      console.log(`    ${colors.gray(sec.dmarc.slice(0, 80))}${sec.dmarc.length > 80 ? '...' : ''}`);
    }
    if (sec.caa?.issue?.length) {
      console.log(colors.bold('  CAA:'));
      sec.caa.issue.forEach((ca: string) => console.log(`    ${colors.cyan('issue')} ${ca}`));
    }

    ctx.lastResponse = { a, aaaa, mx, ns, txt, security };
  } catch (error: any) {
    console.error(colors.red(`DNS lookup failed: ${error.message}`));
  }
  console.log('');
}

export async function runDnsPropagation(ctx: ShellContext, domain: string, type: string = 'A') {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:propagate <domain> [type]'));
      console.log(colors.gray('  Examples: dns:propagate google.com | dns:propagate github.com TXT'));
      console.log(colors.gray('  Or set a base URL first: url https://example.com'));
      return;
    }
  }

  console.log(colors.gray(`Checking DNS propagation for ${domain} (${type})...`));
  
  try {
    const { checkPropagation, formatPropagationReport } = await import('../../../dns/propagation.js');
    const results = await checkPropagation(domain, type);
    console.log(formatPropagationReport(results, domain, type));
    ctx.lastResponse = results;
  } catch (error: any) {
    console.error(colors.red(`Propagation check failed: ${error.message}`));
  }
}

export async function runDnsEmailCheck(ctx: ShellContext, domain?: string, selector?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:email <domain> [dkim-selector]'));
      console.log(colors.gray('  Examples: dns:email google.com | dns:email github.com google'));
      console.log(colors.gray('  Or set a base URL first: url https://example.com'));
      return;
    }
  }

  console.log(colors.gray(`Checking email security for ${domain}...`));
  const startTime = performance.now();

  try {
    const { validateSpf, validateDmarc, checkDkim } = await import('../../../utils/dns-toolkit.js');

    // Run all checks in parallel
    const [spf, dmarc, dkim] = await Promise.all([
      validateSpf(domain),
      validateDmarc(domain),
      checkDkim(domain, selector || 'default')
    ]);

    const duration = Math.round(performance.now() - startTime);
    console.log(colors.green(`✔ Email security check completed`) + colors.gray(` (${duration}ms)
`));

    // SPF Results
    console.log(colors.bold('SPF:'));
    if (spf.valid) {
      console.log(`  ${colors.green('✔')} ${spf.record || 'No record'}`);
    } else {
      console.log(`  ${colors.red('✖')} ${spf.errors?.join(', ') || 'Invalid'}`);
    }
    if (spf.warnings?.length) {
      spf.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
    }

    // DMARC Results
    console.log(colors.bold('\nDMARC:'));
    if (dmarc.valid) {
      console.log(`  ${colors.green('✔')} Policy: ${dmarc.policy || 'none'}`);
      if (dmarc.percentage !== undefined && dmarc.percentage < 100) {
        console.log(`  ${colors.yellow('⚠')} Only ${dmarc.percentage}% of emails affected`);
      }
    } else {
      console.log(`  ${colors.red('✖')} No DMARC record found`);
    }
    if (dmarc.warnings?.length) {
      dmarc.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
    }

    // DKIM Results
    console.log(colors.bold(`\nDKIM (${selector || 'default'}):`));
    if (dkim.found) {
      console.log(`  ${colors.green('✔')} Record found`);
      if (dkim.publicKey) {
        const keyPreview = dkim.publicKey.substring(0, 40) + '...';
        console.log(`  ${colors.gray('Key:')} ${keyPreview}`);
      }
    } else {
      console.log(`  ${colors.yellow('⚠')} No DKIM record for selector "${selector || 'default'}"`);
      console.log(`  ${colors.gray('Try: dns:email ' + domain + ' <selector>')}`);
    }

    console.log('');
    ctx.lastResponse = { spf, dmarc, dkim };
  } catch (error: any) {
    console.error(colors.red(`Email security check failed: ${error.message}`));
  }
}

export async function runDnsHealth(ctx: ShellContext, domain?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:health <domain>'));
      console.log(colors.gray('  Example: dns:health google.com'));
      return;
    }
  }

  console.log(colors.gray(`Checking DNS health for ${domain}...`));
  const startTime = performance.now();

  try {
    const { checkDnsHealth } = await import('../../../utils/dns-toolkit.js');
    const result = await checkDnsHealth(domain);
    const duration = Math.round(performance.now() - startTime);

    console.log(colors.green(`✔ DNS health check completed`) + colors.gray(` (${duration}ms)
`));

    // Format grade color
    const gradeColor = result.grade === 'A' ? colors.green :
                      result.grade === 'B' ? colors.cyan :
                      result.grade === 'C' ? colors.yellow : colors.red;

    console.log(`${colors.bold('DNS Health Report')}`);
    console.log(`  ${colors.gray('Grade:')} ${gradeColor(result.grade)} (${result.score}/100)`);
    console.log(`  ${colors.gray('Checks:')} ${result.checks?.filter((c: any) => c.passed).length || 0} passed, ${result.checks?.filter((c: any) => !c.passed).length || 0} failed`);

    if (result.checks) {
      console.log('');
      result.checks.forEach((check: any) => {
        const icon = check.passed ? colors.green('✔') : colors.red('✖');
        console.log(`  ${icon} ${check.name}: ${check.message || (check.passed ? 'OK' : 'Failed')}`);
      });
    }
    console.log('');
    ctx.lastResponse = result;
  } catch (error: any) {
    console.error(colors.red(`DNS health check failed: ${error.message}`));
  }
}

export async function runDnsSpf(ctx: ShellContext, domain?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:spf <domain>'));
      console.log(colors.gray('  Example: dns:spf google.com'));
      return;
    }
  }

  console.log(colors.gray(`Validating SPF for ${domain}...`));

  try {
    const { validateSpf } = await import('../../../utils/dns-toolkit.js');
    const result = await validateSpf(domain);

    console.log('');
    console.log(colors.bold('SPF Validation'));

    if (result.valid) {
      console.log(`  ${colors.green('✔')} Valid SPF record`);
    } else {
      console.log(`  ${colors.red('✖')} Invalid SPF record`);
    }

    if (result.record) {
      console.log(`  ${colors.gray('Record:')} ${result.record}`);
    }

    if (result.lookupCount !== undefined) {
      const lookupColor = result.lookupCount > 10 ? colors.red : result.lookupCount > 7 ? colors.yellow : colors.green;
      console.log(`  ${colors.gray('DNS Lookups:')} ${lookupColor(result.lookupCount.toString())}/10`);
    }

    if (result.mechanisms && result.mechanisms.length > 0) {
      console.log(`  ${colors.gray('Mechanisms:')} ${result.mechanisms.join(', ')}`);
    }

    if (result.includes && result.includes.length > 0) {
      console.log(`  ${colors.gray('Includes:')} ${result.includes.join(', ')}`);
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('');
      result.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
    }

    if (result.errors && result.errors.length > 0) {
      console.log('');
      result.errors.forEach((e: string) => console.log(`  ${colors.red('✖')} ${e}`));
    }

    console.log('');
    ctx.lastResponse = result;
  } catch (error: any) {
    console.error(colors.red(`SPF validation failed: ${error.message}`));
  }
}

export async function runDnsDmarc(ctx: ShellContext, domain?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:dmarc <domain>'));
      console.log(colors.gray('  Example: dns:dmarc google.com'));
      return;
    }
  }

  console.log(colors.gray(`Validating DMARC for ${domain}...`));

  try {
    const { validateDmarc } = await import('../../../utils/dns-toolkit.js');
    const result = await validateDmarc(domain);

    console.log('');
    console.log(colors.bold('DMARC Validation'));

    if (result.valid) {
      console.log(`  ${colors.green('✔')} Valid DMARC record`);
    } else {
      console.log(`  ${colors.red('✖')} No DMARC record found`);
    }

    if (result.record) {
      console.log(`  ${colors.gray('Record:')} ${result.record}`);
    }

    if (result.policy) {
      const policyColor = result.policy === 'reject' ? colors.green :
                         result.policy === 'quarantine' ? colors.yellow : colors.gray;
      console.log(`  ${colors.gray('Policy:')} ${policyColor(result.policy)}`);
    }

    if (result.subdomainPolicy) {
      console.log(`  ${colors.gray('Subdomain Policy:')} ${result.subdomainPolicy}`);
    }

    if (result.percentage !== undefined && result.percentage < 100) {
      console.log(`  ${colors.yellow('⚠')} Only ${result.percentage}% of emails affected`);
    }

    if (result.rua) {
      console.log(`  ${colors.gray('Aggregate Reports:')} ${result.rua}`);
    }

    if (result.ruf) {
      console.log(`  ${colors.gray('Forensic Reports:')} ${result.ruf}`);
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('');
      result.warnings.forEach((w: string) => console.log(`  ${colors.yellow('⚠')} ${w}`));
    }

    console.log('');
    ctx.lastResponse = result;
  } catch (error: any) {
    console.error(colors.red(`DMARC validation failed: ${error.message}`));
  }
}

export async function runDnsDkim(ctx: ShellContext, domain?: string, selector?: string) {
  if (!domain) {
    domain = ctx.getBaseDomain() || '';
    if (!domain) {
      console.log(colors.yellow('Usage: dns:dkim <domain> [selector]'));
      console.log(colors.gray('  Example: dns:dkim google.com | dns:dkim google.com google'));
      return;
    }
  }

  const dkimSelector = selector || 'default';
  console.log(colors.gray(`Checking DKIM for ${domain} (selector: ${dkimSelector})...`));

  try {
    const { checkDkim } = await import('../../../utils/dns-toolkit.js');
    const result = await checkDkim(domain, dkimSelector);

    console.log('');
    console.log(colors.bold(`DKIM Check (selector: ${dkimSelector})`));

    if (result.found) {
      console.log(`  ${colors.green('✔')} DKIM record found`);
      if (result.publicKey) {
        const keyPreview = result.publicKey.substring(0, 50) + '...';
        console.log(`  ${colors.gray('Public Key:')} ${keyPreview}`);
      }
      if (result.record) {
        console.log(`  ${colors.gray('Record:')} ${result.record.substring(0, 80)}...`);
      }
    } else {
      console.log(`  ${colors.yellow('⚠')} No DKIM record found for selector "${dkimSelector}"`);
      console.log(`  ${colors.gray('Common selectors: google, selector1, selector2, k1, default')}`);
    }

    console.log('');
    ctx.lastResponse = result;
  } catch (error: any) {
    console.error(colors.red(`DKIM check failed: ${error.message}`));
  }
}

export async function runDnsDig(ctx: ShellContext, args: string[]) {
  // Parse dig-style arguments: [@server] domain [type]
  let server = '';
  let domain = '';
  let recordType = 'A';
  let shortMode = false;
  let reverse = false;

  const processedArgs: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('@')) {
      server = arg.slice(1);
    } else if (arg === '+short') {
      shortMode = true;
    } else if (arg.toLowerCase() === 'reverse') {
      reverse = true;
    } else {
      processedArgs.push(arg);
    }
  }

  // First unprocessed arg is domain, second is type
  if (processedArgs.length > 0) {
    domain = processedArgs[0];
  }
  if (processedArgs.length > 1) {
    recordType = processedArgs[1].toUpperCase();
  }

  if (!domain && !reverse) { // If no domain and not reverse lookup, check base domain
    domain = ctx.getBaseDomain() || '';
  }

  if (!domain && !reverse) {
    console.log(colors.yellow('Usage: dns:dig [@server] <domain> [type] [+short] [reverse]'));
    console.log(colors.gray('  Examples:'));
    console.log(colors.gray('    dns:dig google.com'));
    console.log(colors.gray('    dns:dig google.com MX'));
    console.log(colors.gray('    dns:dig @8.8.8.8 google.com A'));
    console.log(colors.gray('    dns:dig 8.8.8.8 reverse'));
    console.log(colors.gray('    dns:dig google.com TXT +short'));
    return;
  } else if (!domain && reverse) { // For reverse lookup, domain is the IP
     domain = processedArgs[0];
  }

  console.log(colors.gray(`Querying ${recordType} record for ${domain}${server ? ` via ${server}` : ''}${reverse ? ' (reverse lookup)' : ''}...`));

  try {
    const { dig, formatDigOutput } = await import('../../../utils/dns-toolkit.js');
    const result = await dig(domain, { type: recordType as any, server: server || undefined, reverse, short: shortMode });

    console.log('');
    if (shortMode) {
      // Short mode: just output the values
      if (result.answer && result.answer.length > 0) {
        result.answer.forEach((ans: any) => {
          console.log(ans.data || ans.address || ans.exchange || JSON.stringify(ans));
        });
      } else {
        console.log(colors.gray('(no results)'));
      }
    } else {
      console.log(formatDigOutput(result, shortMode));
    }
    ctx.lastResponse = result;
  } catch (error: any) {
    console.error(colors.red(`DNS lookup failed: ${error.message}`));
  }
}

export async function runDnsGenerate(ctx: ShellContext, args: string[]) {
  // Parse arguments: dns:generate [policy] [options]
  // Example: dns:generate reject rua=reports@example.com ruf=forensics@example.com
  // Example: dns:generate quarantine sp=none pct=50

  if (args.length === 0 || args[0] === 'help') {
    console.log(colors.bold('DMARC Record Generator'));
    console.log('');
    console.log(colors.yellow('Usage: dns:generate <policy> [options]'));
    console.log('');
    console.log(colors.gray('Policies:'));
    console.log('  none       - Monitor only, take no action');
    console.log('  quarantine - Mark suspicious emails as spam');
    console.log('  reject     - Block suspicious emails');
    console.log('');
    console.log(colors.gray('Options (key=value format):'));
    console.log('  rua=<email>      - Aggregate report address(es), comma-separated');
    console.log('  ruf=<email>      - Forensic report address(es), comma-separated');
    console.log('  sp=<policy>      - Subdomain policy (none|quarantine|reject)');
    console.log('  pct=<0-100>      - Percentage of messages to apply policy');
    console.log('  adkim=<s|r>      - DKIM alignment (s=strict, r=relaxed)');
    console.log('  aspf=<s|r>       - SPF alignment (s=strict, r=relaxed)');
    console.log('  ri=<seconds>     - Report interval (default: 86400 = 1 day)');
    console.log('');
    console.log(colors.gray('Examples:'));
    console.log('  dns:generate reject');
    console.log('  dns:generate reject rua=reports@example.com');
    console.log('  dns:generate quarantine sp=reject pct=50');
    console.log('  dns:generate reject rua=dmarc@example.com,backup@example.com');
    return;
  }

  const policy = args[0].toLowerCase();
  if (!['none', 'quarantine', 'reject'].includes(policy)) {
    console.log(colors.red(`Invalid policy: ${policy}`));
    console.log(colors.gray('Valid policies: none, quarantine, reject'));
    return;
  }

  // Parse options from remaining args
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    const [key, ...valueParts] = args[i].split('=');
    if (valueParts.length > 0) {
      options[key.toLowerCase()] = valueParts.join('=');
    }
  }

  try {
    const { generateDmarc } = await import('../../../utils/dns-toolkit.js');

    const dmarcOptions: any = {
      policy: policy as 'none' | 'quarantine' | 'reject',
    };

    if (options.sp) dmarcOptions.subdomainPolicy = options.sp;
    if (options.pct) dmarcOptions.percentage = parseInt(options.pct);
    if (options.rua) dmarcOptions.aggregateReports = options.rua.split(',');
    if (options.ruf) dmarcOptions.forensicReports = options.ruf.split(',');
    if (options.adkim) dmarcOptions.alignmentDkim = options.adkim === 's' ? 'strict' : 'relaxed';
    if (options.aspf) dmarcOptions.alignmentSpf = options.aspf === 's' ? 'strict' : 'relaxed';
    if (options.ri) dmarcOptions.reportInterval = parseInt(options.ri);

    const record = generateDmarc(dmarcOptions);

    console.log(colors.bold('\nGenerated DMARC Record:'));
    console.log(colors.green(record));
    console.log('');
    console.log(colors.gray('Add this as a TXT record at host: _dmarc'));
    
    ctx.lastResponse = { record, options: dmarcOptions };
  } catch (error: any) {
    console.error(colors.red(`DMARC generation failed: ${error.message}`));
  }
}
