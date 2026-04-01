# Contributing to DeepRun

Thanks for your interest in contributing to DeepRun! This guide will help you get started.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm 9+

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/DeepRun.git`
3. Install dependencies: `npm install`
4. Set up the database:
   - Create databases: `mmfantasy` and `mmfantasy_test`
   - Copy `server/.env.example` to `server/.env` and update the values
   - Run migrations: `for f in database/migrations/*.sql; do psql -U postgres -d mmfantasy -f "$f"; done`
5. Start development servers: `npm run dev:server` and `npm run dev:client`

For full setup details, see the [README](README.md).

## Development Workflow

1. Create a feature branch from `main`: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests and linting before pushing (see below)
4. Push to your fork and open a Pull Request against `main`

## Running Tests

```bash
# All tests
npm test

# Server tests only (Jest)
npm run test:server

# Client tests only (Vitest)
npm run test:client

# Client linting (ESLint)
cd client && npm run lint

# Client build verification
cd client && npm run build
```

## Pull Request Process

- Fill out the PR template completely
- Ensure all CI checks pass (tests, lint, build)
- Keep PRs focused — one feature or fix per PR
- Add or update tests for your changes
- At least one maintainer approval is required before merging

## Coding Standards

- **Client**: ESLint enforced (`cd client && npm run lint`). React components use functional style with hooks.
- **Server**: Layered MVC architecture — routes call services, services call models. Follow existing patterns.
- **Database**: Use parameterized SQL queries only (no string concatenation). All tables use UUID primary keys.
- **Tests**: Use test factories from `server/tests/factories.js` for fixtures. Never seed the test database manually.

## Reporting Bugs

Use the [Bug Report](https://github.com/ian14218/DeepRun/issues/new?template=bug_report.yml) issue template.

## Suggesting Features

Use the [Feature Request](https://github.com/ian14218/DeepRun/issues/new?template=feature_request.yml) issue template.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.
