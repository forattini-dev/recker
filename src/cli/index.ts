import { program } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import colors from '../utils/colors.js';

/**
 * Read data from stdin if piped
 * Example: cat body.json | rek post api.com/users
 */
async function readStdin(): Promise<string | null> {
  // Check if stdin is a TTY (interactive terminal)
  // If it's NOT a TTY, data is being piped
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';

    // Set a timeout to avoid hanging if no data
    const timeout = setTimeout(() => {
      resolve(null);
    }, 100);

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      clearTimeout(timeout);
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      resolve(data.trim() || null);
    });

    process.stdin.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    // Resume stdin in case it was paused
    process.stdin.resume();
  });
}

/**
 * Load environment variables from a .env file
 * @param filePath Path to .env file (default: ./.env)
 */
async function loadEnvFile(filePath?: string | boolean): Promise<Record<string, string>> {
  const envPath = typeof filePath === 'string' ? filePath : join(process.cwd(), '.env');
  const envVars: Record<string, string> = {};

  try {
    const content = await fs.readFile(envPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Parse KEY=value format
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        const cleanKey = key.trim();
        // Remove surrounding quotes from value
        let cleanValue = value.trim();
        if ((cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
            (cleanValue.startsWith("'") && cleanValue.endsWith("'"))) {
          cleanValue = cleanValue.slice(1, -1);
        }

        envVars[cleanKey] = cleanValue;
        // Also set in process.env
        process.env[cleanKey] = cleanValue;
      }
    }

    console.log(colors.gray(`Loaded ${Object.keys(envVars).length} variables from ${envPath}`));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(colors.yellow(`Warning: No .env file found at ${envPath}`));
    } else {
      console.log(colors.red(`Error loading .env: ${error.message}`));
    }
  }

  return envVars;
}

/**
 * CLI Entry Point
 */
async function main() {

  // Dynamic imports for internal modules
  const { handleRequest } = await import('./handler.js');
  const { resolvePreset } = await import('./presets.js');
  const presets = await import('../presets/index.js');

  // Read version from package.json
  let version = '0.0.0';
  try {
    const pkg = await import('../../package.json', { with: { type: 'json' } }) as { default: { version: string } };
    version = pkg.default?.version || '0.0.0';
  } catch {
    // Fallback if JSON import fails
  }

  // Helper to parse headers (Key:Value) and data (key=value)
  function parseMixedArgs(args: string[], hasPreset = false) {
    const headers: Record<string, string> = {};
    const data: Record<string, any> = {};
    let method = 'GET';
    let url = '';

    // Methods list
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    for (const arg of args) {
      // Check for method
      if (methods.includes(arg.toUpperCase())) {
        method = arg.toUpperCase();
        continue;
      }

      // Check for Header (Key:Value)
      if (arg.includes(':') && !arg.includes('://') && !arg.includes('=')) {
        const [key, value] = arg.split(':');
        headers[key.trim()] = value.trim();
        continue;
      }

      // Check for Data (key=value or key:=value)
      if (arg.includes('=')) {
        // Implicit POST if data is provided and method wasn't set explicitly (or was GET)
        if (method === 'GET') method = 'POST';

        const isTyped = arg.includes(':=');
        const separator = isTyped ? ':=' : '=';
        const [key, value] = arg.split(separator);

        if (isTyped) {
          // Try to parse number or boolean
          if (value === 'true') data[key] = true;
          else if (value === 'false') data[key] = false;
          else if (!isNaN(Number(value))) data[key] = Number(value);
          else data[key] = value; // Fallback
        } else {
          data[key] = value;
        }
        continue;
      }

      // Assume URL/Path if nothing else matches
      if (!url) {
        url = arg;
        // Only enforce https:// prefix if NO preset is used
        if (!hasPreset && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('ws://') && !url.startsWith('wss://') && !url.startsWith('udp://')) {
          url = `https://${url}`;
        }
      }
    }

    return { method, url, headers, data };
  }

  // Filter out internal exports and 'registry'
  const PRESET_NAMES = Object.keys(presets).filter(k => k !== 'registry' && !k.startsWith('_'));

  program
    .name('rek')
    .description('The HTTP Client for Humans (and Robots)')
    .version(version)
    .argument('[args...]', 'URL, Method, Headers (Key:Value), Data (key=value)')
    .option('-v, --verbose', 'Show full request/response details')
    .option('-j, --json', 'Force JSON content-type')
    .option('-e, --env [path]', 'Load .env file from current directory or specified path')
    .addHelpText('after', `
${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek httpbin.org/json')}
  ${colors.green('$ rek post api.com/users name="Cyber" role="Admin"')}
  ${colors.green('$ rek @github/user')}
  ${colors.green('$ rek @openai/v1/chat/completions model="gpt-5.1"')}

${colors.bold(colors.yellow('Available Presets:'))}
  ${colors.cyan(PRESET_NAMES.map(p => '@' + p).join(', '))}
`)
    .action(async (args: string[], options: { verbose?: boolean; json?: boolean; env?: string | boolean }) => {
      if (args.length === 0) {
        program.help();
        return;
      }

      // Load .env file if requested
      if (options.env !== undefined) {
        await loadEnvFile(options.env);
      }

      // Read stdin data if piped
      const stdinData = await readStdin();

      let argsToParse = args;
      let presetConfig: any = undefined;

      // Check for preset (@preset)
      if (args[0].startsWith('@')) {
        let presetName = args[0].slice(1); // remove @
        let pathFromPreset = '';

        if (presetName.includes('/')) {
          const parts = presetName.split('/');
          presetName = parts[0];
          pathFromPreset = '/' + parts.slice(1).join('/');
        }

        presetConfig = resolvePreset(presetName);
        argsToParse = args.slice(1);

        if (pathFromPreset) {
          // Inject the extracted path as the first argument for the parser to pick up
          argsToParse.unshift(pathFromPreset);
        }
      }

      const { method, url, headers, data } = parseMixedArgs(argsToParse, !!presetConfig);

      if (!url) {
        console.error(colors.red('Error: URL/Path is required'));
        process.exit(1);
      }

      if (options.json) {
        headers['Content-Type'] = 'application/json';
        headers['Accept'] = 'application/json';
      }

      // Protocol Switcher for WebSocket
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        const { startInteractiveWebSocket } = await import('./tui/websocket.js');
        await startInteractiveWebSocket(url, headers);
        return;
      }

      // Protocol Switcher for UDP
      if (url.startsWith('udp://')) {
        console.log(colors.yellow('UDP mode coming soon...'));
        return;
      }

      // Default HTTP Handler
      try {
        // Determine request body: stdin data takes precedence, then CLI data args
        let body: any = undefined;
        if (stdinData) {
          // Try to parse stdin as JSON, fallback to raw string
          try {
            body = JSON.parse(stdinData);
          } catch {
            body = stdinData;
          }
        } else if (Object.keys(data).length > 0) {
          body = data;
        }

        await handleRequest({
          method,
          url,
          headers,
          body,
          verbose: options.verbose,
          presetConfig
        });
      } catch (error: any) {
        console.error(colors.red(`
Error: ${error.message}`));
        if (options.verbose && error.cause) {
          console.error(error.cause);
        }
        process.exit(1);
      }
    });

  // Completion command
  program
    .command('completion')
    .description('Generate shell completion script')
    .action(() => {
      const script = `
###-begin-rek-completion-###
#
# rek command completion script
#
# Installation: rek completion >> ~/.bashrc  (or ~/.zshrc)
# Or, maybe: source <(rek completion)
#

_rek_completions()
{
  local cur prev words cword
  _init_completion -n : || return

  local presets="${PRESET_NAMES.map(p => '@' + p).join(' ')}"
  local methods="GET POST PUT DELETE PATCH HEAD OPTIONS"
  local opts="-v --verbose -j --json -h --help -V --version"

  if [[ \\$cur == -* ]] ; then
    COMPREPLY=( $(compgen -W "\\$opts" -- \\$cur) )
    return 0
  fi

  if [[ \\$cur == @* ]] ; then
    COMPREPLY=( $(compgen -W "\\$presets" -- \\$cur) )
    return 0
  fi

  # If prev is a method, we likely want a URL next
  # If prev is a preset, we might want a path (handled by generic completion)

  # Suggest methods if it's the first argument (and not a preset/option)
  if [[ \\$cword -eq 1 && ! \\$cur == -* && ! \\$cur == @* ]]; then
     COMPREPLY=( $(compgen -W "\\$methods" -- \\$cur) )
  fi

  return 0
}
complete -F _rek_completions rek
###-end-rek-completion-###
`;
      console.log(script);
    });

  // Interactive Shell command
  program
    .command('shell')
    .alias('interactive')
    .alias('repl')
    .description('Start the interactive Rek Shell')
    .action(async () => {
      const { RekShell } = await import('./tui/shell.js');
      const shell = new RekShell();
      shell.start();
    });

  // Documentation Search command
  program
    .command('docs [query...]')
    .alias('?')
    .description('Search Recker documentation (opens fullscreen panel)')
    .action(async (queryParts: string[]) => {
      const query = queryParts.join(' ').trim();
      const { openSearchPanel } = await import('./tui/search-panel.js');
      await openSearchPanel(query || undefined);
    });

  // Security Headers Grader
  program
    .command('security')
    .alias('headers')
    .description('Analyze HTTP response headers for security best practices')
    .argument('<url>', 'URL to analyze')
    .action(async (url) => {
      if (!url.startsWith('http')) url = `https://${url}`;
      
      const { createClient } = await import('../core/client.js');
      const { analyzeSecurityHeaders } = await import('../utils/security-grader.js');
      
      console.log(colors.gray(`Analyzing security headers for ${url}...`));
      
      try {
        // Initialize client with the target origin to handle relative redirects correctly if needed,
        // though undici handles absolute URLs fine.
        const origin = new URL(url).origin;
        const client = createClient({ baseUrl: origin });
        
        // Just a simple get, let the client defaults handle redirects (default is follow)
        const res = await client.get(url);
        
        const report = analyzeSecurityHeaders(res.headers);
        
        // Color grade
        let gradeColor = colors.red;
        if (report.grade.startsWith('A')) gradeColor = colors.green;
        if (report.grade.startsWith('B')) gradeColor = colors.blue;
        if (report.grade.startsWith('C')) gradeColor = colors.yellow;
        
        console.log(`
${colors.bold(colors.cyan('🛡️  Security Headers Report'))}
Grade: ${gradeColor(colors.bold(report.grade))}  (${report.score}/100)

${colors.bold('Details:')}`);

        report.details.forEach(item => {
          const icon = item.status === 'pass' ? colors.green('✔') : item.status === 'warn' ? colors.yellow('⚠') : colors.red('✖');
          const headerName = colors.bold(item.header);
          const value = item.value ? colors.gray(`= ${item.value.length > 50 ? item.value.slice(0, 47) + '...' : item.value}`) : colors.gray('(missing)');
          
          console.log(`  ${icon} ${headerName} ${value}`);
          if (item.status !== 'pass') {
             console.log(`      ${colors.red('→')} ${item.message}`);
          }
        });
        console.log('');

      } catch (error: any) {
        console.error(colors.red(`Analysis failed: ${error.message}`));
        process.exit(1);
      }
    });

  // IP Intelligence (uses local MaxMind GeoLite2 database)
  program
    .command('ip')
    .description('Get IP address intelligence using local GeoLite2 database')
    .argument('<address>', 'IP address to lookup')
    .action(async (address) => {
        const { getIpInfo, isGeoIPAvailable } = await import('../mcp/ip-intel.js');

        if (!isGeoIPAvailable()) {
            console.log(colors.gray(`Downloading GeoLite2 database...`));
        }

        try {
            const info = await getIpInfo(address);

            if (info.bogon) {
                console.log(colors.yellow(`\n⚠  ${address} is a Bogon/Private IP.`));
                console.log(colors.gray(`   Type: ${info.bogonType}`));
                return;
            }

            console.log(`
${colors.bold(colors.cyan('🌍 IP Intelligence Report'))}

${colors.bold('Location:')}
  ${colors.gray('City:')}      ${info.city || 'N/A'}
  ${colors.gray('Region:')}    ${info.region || 'N/A'}
  ${colors.gray('Country:')}   ${info.country || 'N/A'} ${info.countryCode ? `(${info.countryCode})` : ''}
  ${colors.gray('Continent:')} ${info.continent || 'N/A'}
  ${colors.gray('Timezone:')}  ${info.timezone || 'N/A'}
  ${colors.gray('Coords:')}    ${info.loc ? colors.cyan(info.loc) : 'N/A'}
  ${colors.gray('Accuracy:')}  ${info.accuracy ? `~${info.accuracy} km` : 'N/A'}

${colors.bold('Network:')}
  ${colors.gray('IP:')}        ${info.ip}
  ${colors.gray('Type:')}      ${info.isIPv6 ? 'IPv6' : 'IPv4'}
  ${colors.gray('Postal:')}    ${info.postal || 'N/A'}
`);
        } catch (err: any) {
            console.error(colors.red(`IP Lookup Failed: ${err.message}`));
            process.exit(1);
        }
    });

  // TLS/SSL Inspector
  program
    .command('tls')
    .alias('ssl')
    .description('Inspect TLS/SSL certificate of a host')
    .argument('<host>', 'Hostname or IP address')
    .argument('[port]', 'Port number (default: 443)', '443')
    .action(async (host, port) => {
      const { inspectTLS } = await import('../utils/tls-inspector.js');

      console.log(colors.gray(`Inspecting TLS certificate for ${host}:${port}...`));

      try {
        const info = await inspectTLS(host, parseInt(port));

        // Days remaining color
        let daysColor = colors.green;
        if (info.daysRemaining < 30) daysColor = colors.red;
        else if (info.daysRemaining < 90) daysColor = colors.yellow;

        // Validity status
        const validIcon = info.valid ? colors.green('✔ Valid') : colors.red('✖ Expired');
        const authIcon = info.authorized ? colors.green('✔ Trusted') : colors.yellow('⚠ Self-signed/Untrusted');

        console.log(`
${colors.bold(colors.cyan('🔒 TLS Certificate Report'))}

${colors.bold('Status:')}
  ${validIcon}
  ${authIcon}
  ${colors.gray('Days Remaining:')} ${daysColor(info.daysRemaining.toString())}

${colors.bold('Certificate:')}
  ${colors.gray('Subject:')}       ${info.subject?.CN || info.subject?.O || 'N/A'}
  ${colors.gray('Issuer:')}        ${info.issuer?.CN || info.issuer?.O || 'N/A'}
  ${colors.gray('Valid From:')}    ${info.validFrom.toISOString().split('T')[0]}
  ${colors.gray('Valid To:')}      ${info.validTo.toISOString().split('T')[0]}
  ${colors.gray('Serial:')}        ${info.serialNumber}

${colors.bold('Security:')}
  ${colors.gray('Protocol:')}      ${info.protocol || 'N/A'}
  ${colors.gray('Cipher:')}        ${info.cipher?.name || 'N/A'}
  ${colors.gray('Key:')}           ${info.pubkey ? `${info.pubkey.algo.toUpperCase()} ${info.pubkey.size}-bit` : 'N/A'}

${colors.bold('Fingerprints:')}
  ${colors.gray('SHA-1:')}   ${info.fingerprint}
  ${colors.gray('SHA-256:')} ${info.fingerprint256?.slice(0, 40)}...
`);

        // Show SANs if present
        if (info.altNames && info.altNames.length > 0) {
          console.log(`${colors.bold('Subject Alternative Names:')}`);
          info.altNames.slice(0, 10).forEach(san => {
            console.log(`  ${colors.gray('•')} ${san}`);
          });
          if (info.altNames.length > 10) {
            console.log(`  ${colors.gray(`... and ${info.altNames.length - 10} more`)}`);
          }
          console.log('');
        }

        // Show Extended Key Usage if present
        if (info.extKeyUsage && info.extKeyUsage.length > 0) {
          console.log(`${colors.bold('Extended Key Usage:')}`);
          info.extKeyUsage.forEach(oid => {
            const oidNames: Record<string, string> = {
              '1.3.6.1.5.5.7.3.1': 'Server Authentication',
              '1.3.6.1.5.5.7.3.2': 'Client Authentication',
              '1.3.6.1.5.5.7.3.3': 'Code Signing',
              '1.3.6.1.5.5.7.3.4': 'Email Protection',
            };
            console.log(`  ${colors.gray('•')} ${oidNames[oid] || oid}`);
          });
          console.log('');
        }

      } catch (err: any) {
        console.error(colors.red(`TLS Inspection Failed: ${err.message}`));
        process.exit(1);
      }
    });

  // DNS Toolkit
  const dns = program.command('dns').description('DNS tools and diagnostics');

  dns
    .command('propagate')
    .description('Check global DNS propagation across multiple providers')
    .argument('<domain>', 'Domain name to check')
    .argument('[type]', 'Record type (A, AAAA, CNAME, MX, NS, TXT)', 'A')
    .action(async (domain, type) => {
       const { checkPropagation, formatPropagationReport } = await import('../dns/propagation.js');

       console.log(colors.gray(`Checking propagation for ${domain} (${type})...`));
       const results = await checkPropagation(domain, type);
       console.log(formatPropagationReport(results, domain, type));
    });

  dns
    .command('lookup')
    .description('Perform DNS lookup for any record type')
    .argument('<domain>', 'Domain name to lookup')
    .argument('[type]', 'Record type (A, AAAA, CNAME, MX, NS, TXT, SOA, CAA, SRV, ANY)', 'A')
    .action(async (domain, type) => {
      const { dnsLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Looking up ${type.toUpperCase()} records for ${domain}...`));

      try {
        const results = await dnsLookup(domain, type);

        if (results.length === 0) {
          console.log(colors.yellow(`\nNo ${type.toUpperCase()} records found for ${domain}`));
          return;
        }

        console.log(`\n${colors.bold(colors.cyan('DNS Lookup Results'))}`);
        console.log(`${colors.gray('Domain:')} ${domain}  ${colors.gray('Type:')} ${type.toUpperCase()}\n`);

        results.forEach(record => {
          const ttl = record.ttl ? colors.gray(`TTL: ${record.ttl}s`) : '';
          const data = typeof record.data === 'object'
            ? JSON.stringify(record.data, null, 2)
            : String(record.data);
          console.log(`  ${colors.green('•')} ${colors.bold(record.type.padEnd(6))} ${data} ${ttl}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DNS Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('reverse')
    .description('Perform reverse DNS lookup (IP to hostname)')
    .argument('<ip>', 'IP address to reverse lookup')
    .action(async (ip) => {
      const { reverseLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Performing reverse lookup for ${ip}...`));

      try {
        const hostnames = await reverseLookup(ip);

        if (hostnames.length === 0) {
          console.log(colors.yellow(`\nNo PTR records found for ${ip}`));
          return;
        }

        console.log(`\n${colors.bold(colors.cyan('Reverse DNS Lookup'))}`);
        console.log(`${colors.gray('IP:')} ${ip}\n`);
        console.log(`${colors.bold('Hostnames:')}`);
        hostnames.forEach(hostname => {
          console.log(`  ${colors.green('•')} ${hostname}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`Reverse Lookup Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('health')
    .description('Comprehensive DNS health check with scoring')
    .argument('<domain>', 'Domain name to check')
    .action(async (domain) => {
      const { checkDnsHealth } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Running DNS health check for ${domain}...`));

      try {
        const report = await checkDnsHealth(domain);

        // Grade color
        let gradeColor = colors.red;
        if (report.grade === 'A') gradeColor = colors.green;
        else if (report.grade === 'B') gradeColor = colors.blue;
        else if (report.grade === 'C') gradeColor = colors.yellow;

        console.log(`
${colors.bold(colors.cyan('🏥 DNS Health Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Grade:')} ${gradeColor(colors.bold(report.grade))}  ${colors.gray('Score:')} ${report.score}/100
`);

        console.log(`${colors.bold('Checks:')}`);
        report.checks.forEach(check => {
          const icon = check.status === 'pass' ? colors.green('✔') :
                       check.status === 'warn' ? colors.yellow('⚠') : colors.red('✖');
          console.log(`  ${icon} ${colors.bold(check.name.padEnd(16))} ${check.message}`);
        });
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`Health Check Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('spf')
    .description('Validate SPF record')
    .argument('<domain>', 'Domain name to validate')
    .action(async (domain) => {
      const { validateSpf } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Validating SPF for ${domain}...`));

      try {
        const result = await validateSpf(domain);

        const statusIcon = result.valid ? colors.green('✔ Valid') : colors.red('✖ Invalid');

        console.log(`
${colors.bold(colors.cyan('📧 SPF Validation Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record)}\n`);

          console.log(`${colors.bold('Mechanisms:')} ${result.mechanisms.join(', ')}`);
          console.log(`${colors.bold('Includes:')} ${result.includes.length > 0 ? result.includes.join(', ') : colors.gray('None')}`);
          console.log(`${colors.bold('DNS Lookups:')} ${result.lookupCount}/10 ${result.lookupCount > 7 ? colors.yellow('(high)') : ''}`);
        }

        if (result.warnings.length > 0) {
          console.log(`\n${colors.bold(colors.yellow('Warnings:'))}`);
          result.warnings.forEach(w => console.log(`  ${colors.yellow('⚠')} ${w}`));
        }

        if (result.errors.length > 0) {
          console.log(`\n${colors.bold(colors.red('Errors:'))}`);
          result.errors.forEach(e => console.log(`  ${colors.red('✖')} ${e}`));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`SPF Validation Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('dmarc')
    .description('Validate DMARC record')
    .argument('<domain>', 'Domain name to validate')
    .action(async (domain) => {
      const { validateDmarc } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Validating DMARC for ${domain}...`));

      try {
        const result = await validateDmarc(domain);

        const statusIcon = result.valid ? colors.green('✔ Found') : colors.yellow('⚠ Not Found');
        const policyColor = result.policy === 'reject' ? colors.green :
                            result.policy === 'quarantine' ? colors.yellow : colors.red;

        console.log(`
${colors.bold(colors.cyan('🛡️  DMARC Validation Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record)}\n`);

          console.log(`${colors.bold('Policy:')} ${policyColor(result.policy)}`);
          if (result.subdomainPolicy) {
            console.log(`${colors.bold('Subdomain Policy:')} ${result.subdomainPolicy}`);
          }
          console.log(`${colors.bold('Percentage:')} ${result.percentage}%`);

          if (result.rua) {
            console.log(`${colors.bold('Aggregate Reports (rua):')} ${result.rua.join(', ')}`);
          }
          if (result.ruf) {
            console.log(`${colors.bold('Forensic Reports (ruf):')} ${result.ruf.join(', ')}`);
          }
        }

        if (result.warnings.length > 0) {
          console.log(`\n${colors.bold(colors.yellow('Warnings:'))}`);
          result.warnings.forEach(w => console.log(`  ${colors.yellow('⚠')} ${w}`));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DMARC Validation Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('dkim')
    .description('Check DKIM record for a domain')
    .argument('<domain>', 'Domain name to check')
    .argument('[selector]', 'DKIM selector (default: "default")', 'default')
    .action(async (domain, selector) => {
      const { checkDkim } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Checking DKIM for ${selector}._domainkey.${domain}...`));

      try {
        const result = await checkDkim(domain, selector);

        const statusIcon = result.found ? colors.green('✔ Found') : colors.red('✖ Not Found');

        console.log(`
${colors.bold(colors.cyan('🔑 DKIM Check Report'))}
${colors.gray('Domain:')} ${domain}
${colors.gray('Selector:')} ${selector}
${colors.gray('Status:')} ${statusIcon}
`);

        if (result.record) {
          console.log(`${colors.bold('Record:')}`);
          console.log(`  ${colors.gray(result.record.length > 100 ? result.record.slice(0, 100) + '...' : result.record)}\n`);

          if (result.publicKey) {
            console.log(`${colors.bold('Public Key:')} ${colors.green('Present')} (${result.publicKey.length} chars)`);
          }
        } else {
          console.log(colors.yellow(`No DKIM record found at ${selector}._domainkey.${domain}`));
          console.log(colors.gray('\nCommon selectors to try: google, selector1, selector2, k1, default'));
        }
        console.log('');

      } catch (err: any) {
        console.error(colors.red(`DKIM Check Failed: ${err.message}`));
        process.exit(1);
      }
    });

  dns
    .command('email')
    .description('Full email security audit (SPF + DMARC + DKIM + MX)')
    .argument('<domain>', 'Domain name to audit')
    .option('-s, --selector <selector>', 'DKIM selector to check', 'default')
    .action(async (domain, options) => {
      const { validateSpf, validateDmarc, checkDkim, dnsLookup } = await import('../utils/dns-toolkit.js');

      console.log(colors.gray(`Running email security audit for ${domain}...\n`));

      let score = 0;
      const maxScore = 100;

      console.log(`${colors.bold(colors.cyan('📧 Email Security Audit'))}`);
      console.log(`${colors.gray('Domain:')} ${domain}\n`);

      // MX Records
      console.log(`${colors.bold('Mail Servers (MX):')}`);
      try {
        const mx = await dnsLookup(domain, 'MX');
        if (mx.length > 0) {
          score += 20;
          mx.forEach(record => {
            const data = record.data as { priority: number; exchange: string };
            console.log(`  ${colors.green('✔')} ${data.exchange} ${colors.gray(`(priority: ${data.priority})`)}`);
          });
        } else {
          console.log(`  ${colors.red('✖')} No MX records (cannot receive email)`);
        }
      } catch {
        console.log(`  ${colors.red('✖')} Failed to resolve MX`);
      }

      // SPF
      console.log(`\n${colors.bold('SPF:')}`);
      const spf = await validateSpf(domain);
      if (spf.valid) {
        score += 25;
        console.log(`  ${colors.green('✔')} Valid SPF record`);
        console.log(`    ${colors.gray(spf.record || '')}`);
      } else if (spf.record) {
        score += 10;
        console.log(`  ${colors.yellow('⚠')} SPF exists but has issues`);
        spf.errors.forEach(e => console.log(`    ${colors.red('→')} ${e}`));
      } else {
        console.log(`  ${colors.red('✖')} No SPF record`);
      }

      // DMARC
      console.log(`\n${colors.bold('DMARC:')}`);
      const dmarc = await validateDmarc(domain);
      if (dmarc.valid && dmarc.policy !== 'none') {
        score += 30;
        console.log(`  ${colors.green('✔')} DMARC policy: ${dmarc.policy}`);
      } else if (dmarc.valid) {
        score += 15;
        console.log(`  ${colors.yellow('⚠')} DMARC exists but policy is "none"`);
      } else {
        console.log(`  ${colors.red('✖')} No DMARC record`);
      }

      // DKIM
      console.log(`\n${colors.bold('DKIM:')}`);
      const dkim = await checkDkim(domain, options.selector);
      if (dkim.found) {
        score += 25;
        console.log(`  ${colors.green('✔')} DKIM found (selector: ${options.selector})`);
      } else {
        console.log(`  ${colors.yellow('⚠')} No DKIM at selector "${options.selector}"`);
        console.log(`    ${colors.gray('Try: --selector google, selector1, selector2, k1')}`);
      }

      // Score
      const grade = score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';
      const gradeColor = grade === 'A' ? colors.green : grade === 'B' ? colors.blue : grade === 'C' ? colors.yellow : colors.red;

      console.log(`\n${colors.bold('Score:')} ${score}/${maxScore}  ${colors.bold('Grade:')} ${gradeColor(grade)}\n`);
    });

  dns
    .command('generate-dmarc')
    .description('Generate a DMARC record interactively')
    .option('-p, --policy <policy>', 'Policy: none, quarantine, reject', 'none')
    .option('-sp, --subdomain-policy <policy>', 'Subdomain policy')
    .option('--pct <percent>', 'Percentage of emails to apply policy', '100')
    .option('--rua <emails>', 'Aggregate report email(s), comma-separated')
    .option('--ruf <emails>', 'Forensic report email(s), comma-separated')
    .action(async (options) => {
      const { generateDmarc } = await import('../utils/dns-toolkit.js');

      const dmarcOptions: any = {
        policy: options.policy as 'none' | 'quarantine' | 'reject',
      };

      if (options.subdomainPolicy) {
        dmarcOptions.subdomainPolicy = options.subdomainPolicy;
      }

      if (options.pct && options.pct !== '100') {
        dmarcOptions.percentage = parseInt(options.pct);
      }

      if (options.rua) {
        dmarcOptions.aggregateReports = options.rua.split(',').map((e: string) => e.trim());
      }

      if (options.ruf) {
        dmarcOptions.forensicReports = options.ruf.split(',').map((e: string) => e.trim());
      }

      const record = generateDmarc(dmarcOptions);

      console.log(`
${colors.bold(colors.cyan('🛡️  DMARC Record Generator'))}

${colors.bold('Add this TXT record to your DNS:')}
  ${colors.gray('Name:')}  _dmarc
  ${colors.gray('Type:')}  TXT
  ${colors.gray('Value:')} ${colors.green(record)}

${colors.bold('Policy Explanation:')}
  ${colors.gray('none')}       - Monitor only, take no action
  ${colors.gray('quarantine')} - Send suspicious emails to spam
  ${colors.gray('reject')}     - Reject suspicious emails entirely

${colors.yellow('Tip:')} Start with "none" to monitor, then move to "quarantine", then "reject".
`);
    });

  // Dig command (standalone, like the real dig)
  program
    .command('dig')
    .description('DNS lookup utility (like the real dig)')
    .argument('[args...]', 'Query arguments: [@server] [domain] [type] [-x] [+short]')
    .option('-x, --reverse', 'Reverse DNS lookup (IP to hostname)')
    .allowUnknownOption() // Allow +short and other dig-style options
    .addHelpText('after', `
${colors.bold(colors.yellow('Usage:'))}
  ${colors.green('rek dig example.com')}              ${colors.gray('Query A records')}
  ${colors.green('rek dig example.com MX')}           ${colors.gray('Query MX records')}
  ${colors.green('rek dig example.com ANY')}          ${colors.gray('Query all record types')}
  ${colors.green('rek dig @8.8.8.8 example.com')}     ${colors.gray('Use Google DNS')}
  ${colors.green('rek dig @1.1.1.1 example.com MX')}  ${colors.gray('Use Cloudflare DNS')}
  ${colors.green('rek dig -x 8.8.8.8')}               ${colors.gray('Reverse lookup')}
  ${colors.green('rek dig +short example.com')}       ${colors.gray('Short output (just answers)')}

${colors.bold(colors.yellow('Common DNS Servers:'))}
  ${colors.cyan('@8.8.8.8')}     Google Public DNS
  ${colors.cyan('@1.1.1.1')}     Cloudflare DNS
  ${colors.cyan('@9.9.9.9')}     Quad9 DNS
  ${colors.cyan('@208.67.222.222')}  OpenDNS

${colors.bold(colors.yellow('Record Types:'))}
  A, AAAA, MX, NS, TXT, CNAME, SOA, PTR, SRV, CAA, ANY
`)
    .action(async (args: string[], cmdOptions: { reverse?: boolean }) => {
      const { dig, formatDigOutput } = await import('../utils/dns-toolkit.js');

      let domain = '';
      let server: string | undefined;
      let type = 'A';
      let reverse = cmdOptions.reverse || false;
      let short = false;

      for (const arg of args) {
        if (arg.startsWith('@')) {
          server = arg.slice(1);
        } else if (arg === '+short') {
          short = true;
        } else if (arg.match(/^[A-Z]+$/i) && ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'PTR', 'SRV', 'CAA', 'NAPTR', 'ANY'].includes(arg.toUpperCase())) {
          type = arg.toUpperCase();
        } else if (!domain) {
          domain = arg;
        }
      }

      if (!domain) {
        console.error(colors.red('Error: Domain/IP is required'));
        console.log(colors.gray('Usage: rek dig example.com [TYPE]'));
        console.log(colors.gray('       rek dig -x 8.8.8.8'));
        process.exit(1);
      }

      try {
        const result = await dig(domain, { server, type, reverse, short });
        console.log(formatDigOutput(result, short));
      } catch (err: any) {
        console.error(colors.red(`dig: ${err.message}`));
        process.exit(1);
      }
    });

  // Benchmark command
  const bench = program.command('bench').description('Performance benchmarking tools');

  bench
    .command('load')
    .description('Run a load test with real-time dashboard')
    .argument('[args...]', 'URL and options (users=10 duration=10s mode=throughput http2)')
    .addHelpText('after', `
${colors.bold(colors.yellow('Options (key=value):'))}
  ${colors.green('users')}     Number of concurrent users    ${colors.gray('(default: 50)')}
  ${colors.green('duration')}  Test duration in seconds      ${colors.gray('(default: 300)')}
  ${colors.green('ramp')}      Ramp-up time in seconds       ${colors.gray('(default: 5)')}
  ${colors.green('mode')}      Test mode                     ${colors.gray('(default: throughput)')}
               ${colors.gray('Values: throughput, stress, realistic')}
  ${colors.green('http2')}     Force HTTP/2                  ${colors.gray('(default: false)')}

${colors.bold(colors.yellow('Examples:'))}
  ${colors.green('$ rek bench load httpbin.org/get users=100 duration=60 ramp=10')}
  ${colors.green('$ rek bench load https://api.com/heavy mode=stress http2=true')}
`)
    .action(async (args: string[]) => {
        let url = '';
        let users = 50;
        let duration = 300;
        let mode: any = 'throughput';
        let http2 = false;
        let rampUp = 5;

        for (const arg of args) {
            if (arg.includes('=')) {
                const [key, val] = arg.split('=');
                const k = key.toLowerCase();
                
                if (k === 'users' || k === 'u') users = parseInt(val);
                else if (k === 'duration' || k === 'd' || k === 'time') duration = parseInt(val);
                else if (k === 'mode' || k === 'm') mode = val;
                else if (k === 'http2') http2 = val === 'true';
                else if (k === 'ramp' || k === 'rampup') rampUp = parseInt(val);
                
            } else if (arg.toLowerCase() === 'http2') {
                http2 = true;
            } else if (!url) {
                url = arg;
                if (!url.startsWith('http')) url = `https://${url}`;
            }
        }

        if (!url) {
            console.error(colors.red('Error: URL is required. Example: rek bench load httpbin.org users=50'));
            process.exit(1);
        }

        const { startLoadDashboard } = await import('./tui/load-dashboard.js');
        await startLoadDashboard({ url, users, duration, mode, http2, rampUp });
    });

  // MCP Server command
  program
    .command('mcp')
    .description('Start MCP server for AI agents to access Recker documentation')
    .option('-t, --transport <mode>', 'Transport mode: stdio, http, sse', 'stdio')
    .option('-p, --port <number>', 'Server port (for http/sse modes)', '3100')
    .option('-d, --docs <path>', 'Path to documentation folder')
    .option('--debug', 'Enable debug logging')
    .addHelpText('after', `
${colors.bold(colors.yellow('Transport Modes:'))}
  ${colors.cyan('stdio')}  ${colors.gray('(default)')} For Claude Code and other CLI tools
  ${colors.cyan('http')}   Simple HTTP POST endpoint
  ${colors.cyan('sse')}    HTTP + Server-Sent Events for real-time notifications

${colors.bold(colors.yellow('Usage:'))}
  ${colors.green('$ rek mcp')}                    ${colors.gray('Start in stdio mode (for Claude Code)')}
  ${colors.green('$ rek mcp -t http')}            ${colors.gray('Start HTTP server on port 3100')}
  ${colors.green('$ rek mcp -t sse -p 8080')}     ${colors.gray('Start SSE server on custom port')}
  ${colors.green('$ rek mcp --debug')}            ${colors.gray('Enable debug logging')}

${colors.bold(colors.yellow('Tools provided:'))}
  ${colors.cyan('search_docs')}  Search documentation by keyword
  ${colors.cyan('get_doc')}      Get full content of a doc file

${colors.bold(colors.yellow('Claude Code config (~/.claude.json):'))}
  ${colors.gray(`{
    "mcpServers": {
      "recker-docs": {
        "command": "npx",
        "args": ["recker", "mcp"]
      }
    }
  }`)}
`)
    .action(async (options: { transport: string; port: string; docs?: string; debug?: boolean }) => {
      const { MCPServer } = await import('../mcp/server.js');
      const transport = options.transport as 'stdio' | 'http' | 'sse';

      const server = new MCPServer({
        transport,
        port: parseInt(options.port),
        docsPath: options.docs,
        debug: options.debug,
      });

      // For stdio mode, start silently (output goes to stderr if debug)
      if (transport === 'stdio') {
        await server.start();
        // Server runs until stdin closes
        return;
      }

      // For http/sse modes, show the UI
      await server.start();

      const endpoints = transport === 'sse'
        ? `
│  POST /        - JSON-RPC endpoint          │
│  GET  /sse     - Server-Sent Events         │
│  GET  /health  - Health check               │`
        : `
│  POST /        - JSON-RPC endpoint          │`;

      console.log(colors.green(`
┌─────────────────────────────────────────────┐
│  ${colors.bold('Recker MCP Server')}                         │
├─────────────────────────────────────────────┤
│  Transport: ${colors.cyan(transport.padEnd(31))}│
│  Endpoint: ${colors.cyan(`http://localhost:${options.port}`.padEnd(32))}│
│  Docs indexed: ${colors.yellow(String(server.getDocsCount()).padEnd(28))}│
├─────────────────────────────────────────────┤${endpoints}
├─────────────────────────────────────────────┤
│  Tools:                                     │
│    • ${colors.cyan('search_docs')} - Search documentation     │
│    • ${colors.cyan('get_doc')}     - Get full doc content     │
│                                             │
│  Press ${colors.bold('Ctrl+C')} to stop                       │
└─────────────────────────────────────────────┘
`));

      // Keep alive
      process.on('SIGINT', async () => {
        console.log(colors.yellow('\nShutting down MCP server...'));
        await server.stop();
        process.exit(0);
      });
    });

  program.parse();
}

// Run the CLI
main().catch((error) => {
  console.error('CLI Error:', error.message);
  process.exit(1);
});
