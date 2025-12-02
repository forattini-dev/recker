export interface SecurityHeaderResult {
  header: string;
  value?: string;
  status: 'pass' | 'warn' | 'fail';
  score: number; // Negative penalty or positive bonus
  message: string;
}

export interface SecurityReport {
  grade: string; // A+, A, B, C, D, F
  score: number; // 0-100
  details: SecurityHeaderResult[];
}

const HEADERS_CHECKS: Array<{
  header: string;
  weight: number; // Impact on score (0-100 scale, roughly)
  check: (value?: string) => { status: 'pass' | 'warn' | 'fail'; message: string };
}> = [
  {
    header: 'strict-transport-security',
    weight: 25,
    check: (val) => {
      if (!val) return { status: 'fail', message: 'HSTS not enabled. Vulnerable to SSL stripping.' };
      if (!val.includes('max-age=')) return { status: 'fail', message: 'Invalid HSTS: missing max-age.' };
      const maxAge = parseInt(val.match(/max-age=(\d+)/)?.[1] || '0');
      if (maxAge < 15552000) return { status: 'warn', message: 'HSTS max-age is less than 6 months.' };
      if (!val.includes('includeSubDomains')) return { status: 'warn', message: 'HSTS does not include subdomains.' };
      return { status: 'pass', message: 'HSTS enabled with long duration.' };
    }
  },
  {
    header: 'content-security-policy',
    weight: 25,
    check: (val) => {
      if (!val) return { status: 'fail', message: 'CSP is missing. Vulnerable to XSS.' };
      if (val.includes("'unsafe-inline'") || val.includes("'unsafe-eval'")) return { status: 'warn', message: 'CSP includes unsafe directives.' };
      if (val.includes('default-src *') || val.includes('script-src *')) return { status: 'warn', message: 'CSP too permissive (*).' };
      return { status: 'pass', message: 'CSP enabled.' };
    }
  },
  {
    header: 'x-frame-options',
    weight: 15,
    check: (val) => {
      if (!val) return { status: 'fail', message: 'Missing X-Frame-Options. Vulnerable to Clickjacking.' };
      if (val.toUpperCase() === 'DENY' || val.toUpperCase() === 'SAMEORIGIN') return { status: 'pass', message: 'Clickjacking protection enabled.' };
      return { status: 'warn', message: 'X-Frame-Options set but might be permissive.' };
    }
  },
  {
    header: 'x-content-type-options',
    weight: 10,
    check: (val) => {
      if (!val) return { status: 'fail', message: 'Missing X-Content-Type-Options.' };
      if (val.toLowerCase() === 'nosniff') return { status: 'pass', message: 'MIME sniffing disabled.' };
      return { status: 'fail', message: 'Value must be "nosniff".' };
    }
  },
  {
    header: 'referrer-policy',
    weight: 10,
    check: (val) => {
      if (!val) return { status: 'warn', message: 'Missing Referrer-Policy.' };
      if (val.includes('no-referrer') || val.includes('same-origin') || val.includes('strict-origin')) return { status: 'pass', message: 'Referrer leakage limited.' };
      return { status: 'warn', message: 'Referrer-Policy might leak information.' };
    }
  },
  {
    header: 'permissions-policy',
    weight: 10,
    check: (val) => {
      if (!val) return { status: 'warn', message: 'Missing Permissions-Policy (Feature-Policy).' };
      return { status: 'pass', message: 'Permissions-Policy enabled.' };
    }
  },
  {
    header: 'server', // Information Leakage
    weight: 0, // Doesn't affect score much, but good to hide
    check: (val) => {
      if (val) return { status: 'warn', message: 'Server header exposes technology stack.' };
      return { status: 'pass', message: 'Server info hidden.' };
    }
  },
  {
    header: 'x-powered-by', // Information Leakage
    weight: 5,
    check: (val) => {
      if (val) return { status: 'fail', message: 'X-Powered-By exposes technology stack (e.g. Express/PHP).' };
      return { status: 'pass', message: 'Technology stack hidden.' };
    }
  }
];

export function analyzeSecurityHeaders(headers: Headers): SecurityReport {
  let totalScore = 100;
  let penalty = 0;
  const details: SecurityHeaderResult[] = [];

  for (const check of HEADERS_CHECKS) {
    const value = headers.get(check.header);
    const result = check.check(value || undefined);
    
    // Calculate penalty
    let itemPenalty = 0;
    if (result.status === 'fail') {
      itemPenalty = check.weight;
    } else if (result.status === 'warn') {
      itemPenalty = Math.ceil(check.weight / 2);
    }

    // Special handling for Info Leakage (Server/X-Powered-By)
    // Fail means we found it (which is bad), Pass means missing (which is good)
    // Wait, standard logic: Fail = Missing protection OR Present vulnerability
    // For 'Server'/'X-Powered-By': Present = Fail/Warn. Missing = Pass.
    // The check functions above handle this logic correctly.

    penalty += itemPenalty;

    details.push({
      header: check.header,
      value: value || undefined,
      status: result.status,
      score: -itemPenalty,
      message: result.message
    });
  }

  // Calculate final score
  const finalScore = Math.max(0, totalScore - penalty);

  // Assign Grade
  let grade = 'F';
  if (finalScore >= 95) grade = 'A+';
  else if (finalScore >= 90) grade = 'A';
  else if (finalScore >= 80) grade = 'B';
  else if (finalScore >= 70) grade = 'C';
  else if (finalScore >= 60) grade = 'D';

  return {
    grade,
    score: finalScore,
    details
  };
}
