import colors from '../../../utils/colors.js';
import { ShellContext } from './context.js';

export async function runSecurityGrader(ctx: ShellContext, url?: string) {
    if (!url) {
      url = ctx.baseUrl || '';
      if (!url) {
        console.log(colors.yellow('Usage: security <url>'));
        console.log(colors.gray('  Examples: security google.com | security https://example.com'));
        console.log(colors.gray('  Or set a base URL first: url https://example.com'));
        return;
      }
    } else if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    console.log(colors.gray(`Analyzing security headers for ${url}...`));
    
    try {
      const { analyzeSecurityHeaders } = await import('../../../utils/security-grader.js');
      // Use client from context
      const res = await ctx.client.get(url); 
      
      const report = analyzeSecurityHeaders(res.headers);
      
      // Color grade
      let gradeColor = colors.red;
      if (report.grade.startsWith('A')) gradeColor = colors.green;
      else if (report.grade.startsWith('B')) gradeColor = colors.blue;
      else if (report.grade.startsWith('C')) gradeColor = colors.yellow;
      
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
      ctx.lastResponse = report;

    } catch (error: any) {
      console.error(colors.red(`Analysis failed: ${error.message}`));
    }
    console.log(''); // Spacer
}
