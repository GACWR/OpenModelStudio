# Contributing to OpenModelStudio

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/OpenModelStudio.git`
3. Create a branch: `git checkout -b feat/my-feature`
4. Set up the development environment: `make dev`

## Development Workflow

```bash
# Start local dev environment
make dev

# Make your changes...

# Run lints
make lint

# Run tests
make test

# Commit with conventional commits
git commit -m "feat: add cool new feature"
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Description |
|--------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `refactor:` | Code refactoring |
| `test:` | Adding or updating tests |
| `chore:` | Maintenance tasks |
| `perf:` | Performance improvements |

## Code Style

### Rust
- Follow `rustfmt` defaults
- Run `cargo clippy` with no warnings
- All public functions need doc comments

### TypeScript
- ESLint (config in `web/eslint.config.mjs`)
- Use functional components with hooks
- Prefer `const` over `let`

### SQL
- Lowercase keywords
- Snake_case for table and column names
- Every migration must be reversible

## Pull Request Process

1. Ensure all tests pass (`make test`)
2. Update documentation if needed
3. Add tests for new features
4. Fill out the PR template
5. Request review from a maintainer

## Reporting Issues

- Use GitHub Issues
- Include reproduction steps
- Include environment details (OS, versions)
- Screenshots for UI issues

## Architecture Decisions

Major changes should be discussed in an issue first. Include:
- Problem statement
- Proposed solution
- Alternatives considered
- Impact on existing code

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
