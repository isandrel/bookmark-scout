# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT create a public GitHub issue** for security vulnerabilities
2. **Email**: Send details to [security@bookmark-scout.com](mailto:security@bookmark-scout.com) (or create a private security advisory below)
3. **GitHub Security Advisory**: [Create a private security advisory](https://github.com/isandrel/bookmark-scout/security/advisories/new)

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: 90 days

### After Reporting

1. We'll investigate and validate the report
2. We'll work on a fix and coordinate disclosure timing
3. We'll credit you in the security advisory (unless you prefer anonymity)
4. Once fixed, we'll publish a security advisory

## Security Measures

This project implements the following security measures:

- **CodeQL Analysis**: Automated code scanning for vulnerabilities
- **Dependency Review**: Scanning for vulnerable dependencies on PRs
- **Dependabot**: Automated dependency updates
- **Branch Protection**: Required status checks before merging

## Best Practices for Contributors

- Never commit secrets, API keys, or credentials
- Keep dependencies up to date
- Follow secure coding practices
- Report any security concerns immediately

## Scope

This security policy applies to:
- The Bookmark Scout browser extension
- The Bookmark Scout website
- All related repositories under this organization

Thank you for helping keep Bookmark Scout and its users safe! 🛡️
