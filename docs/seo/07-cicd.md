# CI/CD Integration

Integrate Recker's SEO analysis into your CI/CD pipelines to catch SEO regressions before deployment.

## GitHub Actions

### Basic SEO Check

```yaml
# .github/workflows/seo.yml
name: SEO Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Recker
        run: npm install -g recker

      - name: Build site
        run: npm run build

      - name: Start preview server
        run: |
          npx serve dist -p 3000 &
          sleep 5

      - name: Run SEO Analysis
        run: |
          rek seo http://localhost:3000 --format json -o seo-report.json
          # Check if score meets threshold
          SCORE=$(jq '.score' seo-report.json)
          if [ "$SCORE" -lt 70 ]; then
            echo "SEO score $SCORE is below threshold (70)"
            exit 1
          fi

      - name: Upload SEO Report
        uses: actions/upload-artifact@v4
        with:
          name: seo-report
          path: seo-report.json
```

### Multi-Page Spider Check

```yaml
name: SEO Spider

on:
  schedule:
    - cron: '0 0 * * 1' # Weekly on Monday
  workflow_dispatch:

jobs:
  spider:
    runs-on: ubuntu-latest
    steps:
      - name: Install Recker
        run: npm install -g recker

      - name: Spider Site
        run: |
          rek spider https://example.com seo=true depth=3 maxPages=100 --format json -o spider-report.json

      - name: Check for Issues
        run: |
          ERRORS=$(jq '.summary.pagesWithErrors' spider-report.json)
          DUPLICATES=$(jq '.summary.duplicateTitles' spider-report.json)

          if [ "$ERRORS" -gt 5 ]; then
            echo "Too many pages with errors: $ERRORS"
            exit 1
          fi

          if [ "$DUPLICATES" -gt 0 ]; then
            echo "Found $DUPLICATES duplicate titles"
            exit 1
          fi

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: spider-report
          path: spider-report.json
```

### PR Comment with Results

```yaml
name: SEO PR Check

on:
  pull_request:

jobs:
  seo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup and Build
        run: |
          npm ci
          npm run build
          npx serve dist -p 3000 &
          sleep 5

      - name: Run SEO Analysis
        run: |
          npm install -g recker
          rek seo http://localhost:3000 --format json -o report.json

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = JSON.parse(fs.readFileSync('report.json', 'utf8'));

            const body = `## SEO Analysis Results

            **Score:** ${report.score}/100 (${report.grade})

            | Metric | Value |
            |--------|-------|
            | Passed | ${report.summary.passed} |
            | Warnings | ${report.summary.warnings} |
            | Errors | ${report.summary.errors} |

            ${report.summary.topIssues.length > 0 ? `
            ### Top Issues
            ${report.summary.topIssues.map(i => `- **${i.name}**: ${i.message}`).join('\n')}
            ` : '✅ No critical issues found'}
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

## Programmatic Integration

### Threshold Checking

```typescript
import { analyzeSeo } from 'recker/seo';

interface ThresholdConfig {
  minScore: number;
  maxErrors: number;
  maxWarnings: number;
  requiredChecks?: string[];
}

async function checkSeoThresholds(
  url: string,
  config: ThresholdConfig
): Promise<{ passed: boolean; message: string }> {
  const response = await fetch(url);
  const html = await response.text();
  const report = await analyzeSeo(html, { baseUrl: url });

  const issues: string[] = [];

  if (report.score < config.minScore) {
    issues.push(`Score ${report.score} is below threshold ${config.minScore}`);
  }

  if (report.summary.errors > config.maxErrors) {
    issues.push(`${report.summary.errors} errors exceed max ${config.maxErrors}`);
  }

  if (report.summary.warnings > config.maxWarnings) {
    issues.push(`${report.summary.warnings} warnings exceed max ${config.maxWarnings}`);
  }

  // Check required checks passed
  if (config.requiredChecks) {
    for (const checkName of config.requiredChecks) {
      const check = report.checks.find(c => c.name === checkName);
      if (!check || check.status !== 'pass') {
        issues.push(`Required check "${checkName}" did not pass`);
      }
    }
  }

  return {
    passed: issues.length === 0,
    message: issues.length > 0 ? issues.join('\n') : 'All checks passed'
  };
}

// Usage
const result = await checkSeoThresholds('https://example.com', {
  minScore: 80,
  maxErrors: 0,
  maxWarnings: 5,
  requiredChecks: ['Title Length', 'Meta Description']
});

if (!result.passed) {
  console.error(result.message);
  process.exit(1);
}
```

### Spider with Thresholds

```typescript
import { seoSpider } from 'recker/seo';

async function spiderWithThresholds(url: string) {
  const result = await seoSpider(url, {
    seo: true,
    maxPages: 50,
    depth: 3
  });

  const issues: string[] = [];

  // Check average score
  if (result.summary.avgScore < 70) {
    issues.push(`Average score ${result.summary.avgScore} is too low`);
  }

  // Check for duplicate content
  if (result.summary.duplicateTitles > 0) {
    issues.push(`Found ${result.summary.duplicateTitles} duplicate titles`);
  }

  if (result.summary.duplicateDescriptions > 0) {
    issues.push(`Found ${result.summary.duplicateDescriptions} duplicate descriptions`);
  }

  // Check for orphan pages
  if (result.summary.orphanPages > 0) {
    issues.push(`Found ${result.summary.orphanPages} orphan pages`);
  }

  // Check individual page scores
  const lowScorePages = result.pages.filter(
    p => p.seoReport && p.seoReport.score < 60
  );
  if (lowScorePages.length > 0) {
    issues.push(`${lowScorePages.length} pages have score below 60`);
  }

  return {
    passed: issues.length === 0,
    issues,
    summary: result.summary
  };
}
```

## Pre-commit Hook

### Using Husky

```bash
# Install husky
npm install -D husky
npx husky init
```

```bash
# .husky/pre-commit
#!/bin/sh

# Only check staged HTML files
STAGED_HTML=$(git diff --cached --name-only --diff-filter=ACM | grep '\.html$')

if [ -n "$STAGED_HTML" ]; then
  echo "Running SEO check on staged HTML files..."

  for file in $STAGED_HTML; do
    SCORE=$(npx rek seo "file://$file" --format json | jq '.score')
    if [ "$SCORE" -lt 70 ]; then
      echo "SEO score for $file is $SCORE (minimum: 70)"
      exit 1
    fi
  done
fi
```

## Lighthouse CI Integration

Combine with Lighthouse for comprehensive checks:

```yaml
name: SEO + Lighthouse

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build
        run: |
          npm ci
          npm run build

      - name: Start server
        run: |
          npx serve dist -p 3000 &
          sleep 5

      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:3000
          uploadArtifacts: true

      - name: Recker SEO
        run: |
          npm install -g recker
          rek seo http://localhost:3000 --format json -o seo.json

      - name: Combined Check
        run: |
          LH_SCORE=$(cat .lighthouseci/lhr-*.json | jq '.categories.seo.score * 100')
          REK_SCORE=$(jq '.score' seo.json)

          echo "Lighthouse SEO: $LH_SCORE"
          echo "Recker SEO: $REK_SCORE"

          # Recker provides more detailed checks
          if [ "$REK_SCORE" -lt 80 ]; then
            echo "Recker detailed SEO check failed"
            exit 1
          fi
```

## JSON Report Structure

The JSON output includes everything needed for CI checks:

```json
{
  "url": "https://example.com",
  "score": 85,
  "grade": "B",
  "summary": {
    "totalChecks": 150,
    "passed": 120,
    "warnings": 25,
    "errors": 5,
    "passRate": 80,
    "topIssues": [...],
    "quickWins": [...]
  },
  "checks": [
    {
      "name": "Title Length",
      "status": "pass",
      "message": "Good title length (55 chars)"
    },
    ...
  ]
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (all checks pass thresholds) |
| 1 | SEO issues found (threshold not met) |
| 2 | Network/fetch error |
| 3 | Invalid configuration |

## Best Practices

1. **Set Realistic Thresholds** - Start with score 70, increase gradually
2. **Focus on Errors** - Prioritize fixing errors over warnings
3. **Monitor Trends** - Track scores over time, not just pass/fail
4. **Required Checks** - Mandate critical checks (title, description, canonical)
5. **Spider Weekly** - Full site checks don't need to run on every PR
6. **Cache Reports** - Store reports for comparison between builds

## Next Steps

- **[Analyzer](02-analyzer.md)** - Programmatic API details
- **[Spider](03-spider.md)** - Site-wide crawling
- **[Categories](06-categories.md)** - All check categories
