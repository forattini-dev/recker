import { RekCommand as Command } from '../router.js';
import colors from '../../utils/colors.js';

export function registerSecurityCommand(program: Command) {
  program
    .command('security')
    .alias('headers')
    .alias('grade')
    .description('Grade a website\'s security headers (A+ to F) for HSTS, CSP, X-Frame-Options, and more')
    .argument('<url>', {
      type: 'url',
      description: 'URL to analyze for security headers',
      example: 'github.com',
    })
    .example('rek security github.com', 'Grade GitHub\'s headers')
    .example('rek security example.com --json', 'Get JSON report')
    .example('rek headers cloudflare.com', 'Use headers alias')
    .action(async (url: string) => {
      if (!url.startsWith('http')) url = `https://${url}`;
      
      const { createClient } = await import('../../core/client.js');
      const { analyzeSecurityHeaders } = await import('../../utils/security-grader.js');
      
      console.log(colors.gray(`Analyzing security headers for ${url}...`));
      
      try {
        const origin = new URL(url).origin;
        const client = createClient({ baseUrl: origin });
        const res = await client.get(url);
        const report = analyzeSecurityHeaders(res.headers);
        
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
}
