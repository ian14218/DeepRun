# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, please use [GitHub's private vulnerability reporting](https://github.com/ian14218/DeepRun/security/advisories/new) to report security issues.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Fix timeline**: Provided within 7 days of acknowledgment
- **Disclosure**: Coordinated disclosure after fix is released

## Scope

### In Scope

- Authentication and authorization bypass
- SQL injection
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Secrets or credentials exposure
- Dependency vulnerabilities with exploitable impact

### Out of Scope

- Self-hosted deployment misconfigurations
- Denial of service on self-hosted instances
- Issues in third-party dependencies without a demonstrated exploit
