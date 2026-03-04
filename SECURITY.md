# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to: **security@tetis.io**

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

### Safe Harbor

We support safe harbor for security researchers who:
- Make a good faith effort to avoid privacy violations, data destruction, and service interruption
- Only interact with accounts you own or with explicit permission
- Do not exploit vulnerabilities beyond what is necessary to demonstrate them
- Report vulnerabilities promptly and do not disclose publicly until resolved

## Security Best Practices

When using Recker in your applications:

1. **Keep dependencies updated**: Run `pnpm audit` regularly
2. **Use environment variables**: Never hardcode API keys or credentials
3. **Validate inputs**: Always validate URLs and user inputs before passing to Recker
4. **Use HTTPS**: Prefer HTTPS over HTTP for sensitive data
5. **Review presets**: When using API presets, review their default configurations

## Known Security Considerations

### HTTP Client
- Recker follows redirects by default (max 20). Configure `maxRedirects: 0` to disable
- Cookies are not persisted by default. Use the `cookie-jar` plugin if needed
- SSL/TLS certificate validation is enabled by default

### Protocols
- FTP/SFTP: Credentials are never logged
- WebSocket: Use `wss://` for encrypted connections
- DNS: Uses system resolver by default

## Dependencies

We regularly audit our dependencies for vulnerabilities. Our direct dependencies are:
- `undici` - HTTP transport (actively maintained by Node.js team)
- `zod` - Schema validation
- `css-select` - HTML parsing
- `he` - HTML entities

All dependencies are pinned to specific versions and updated regularly.
