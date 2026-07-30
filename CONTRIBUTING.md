# Contributing to WhatsApp Clone

Thank you for your interest in contributing! This guide covers everything you
need to get started.

---

## Workflow

1. **Fork** the repository and clone your fork locally.
2. Create a feature branch off `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
3. Make your changes (see code style guide below).
4. Commit your changes following the commit message convention.
5. Push to your fork and open a **Pull Request** against `main`.
6. A maintainer will review your PR. Address any feedback and the PR will be merged.

---

## Branch Naming

| Type         | Pattern                   | Example                        |
|--------------|---------------------------|--------------------------------|
| New feature  | `feature/<short-desc>`    | `feature/message-reactions`    |
| Bug fix      | `fix/<short-desc>`        | `fix/ws-reconnect-loop`        |
| Documentation| `docs/<short-desc>`       | `docs/update-api-reference`    |
| Chore/deps   | `chore/<short-desc>`      | `chore/bump-axum-version`      |

---

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) spec:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer: Closes #123]
```

**Types:**

| Type       | When to use                                          |
|------------|------------------------------------------------------|
| `feat`     | A new user-visible feature                           |
| `fix`      | A bug fix                                            |
| `docs`     | Documentation changes only                          |
| `chore`    | Build scripts, dependency updates, tooling changes  |
| `refactor` | Code restructuring without behaviour change         |
| `test`     | Adding or fixing tests                              |
| `perf`     | Performance improvements                            |
| `ci`       | CI/CD pipeline changes                              |

**Examples:**

```
feat(messages): add message reaction endpoints
fix(auth): refresh token not invalidated on logout
docs(readme): add Fly.io deployment section
chore(deps): bump axum to 0.7.5
```

---

## Code Style — Backend (Rust)

- Run **`cargo fmt`** before every commit. CI will fail if formatting is wrong.
- Run **`cargo clippy -- -D warnings`**. All Clippy warnings must be resolved (not suppressed) unless there is a very good reason.
- Prefer `anyhow::Result` for error propagation in handlers; define domain-specific `thiserror` error types where appropriate.
- Use `tracing::instrument` on public handler functions.
- Write unit tests for non-trivial logic; integration tests for HTTP endpoints.

```bash
cd backend
make fmt      # auto-format
make lint     # clippy check
make test     # run tests
```

---

## Code Style — Frontend (TypeScript / Next.js)

- **ESLint must pass**: `npm run lint` — fix all errors before opening a PR.
- Prefer **named exports** over default exports for components.
- Keep components small and single-purpose. Co-locate component-specific styles.
- Use **React Query** for all server state; use **Zustand** for client-only state.
- Add JSDoc comments to all exported functions and types.

```bash
cd frontend
npm run lint      # ESLint check
npm run type-check  # TypeScript check (tsc --noEmit)
```

---

## Database Migrations

- All schema changes must include a migration file.
- Naming convention: `NNN_description.sql` where `NNN` is the auto-generated
  timestamp prefix produced by `cargo sqlx migrate add <description>`.
- Migration files must be **non-destructive** where possible (add columns with
  defaults, avoid `DROP COLUMN` in the forward migration).
- Include a corresponding **rollback** strategy in your PR description.

```bash
cd backend
cargo sqlx migrate add add_message_reactions   # creates migrations/TIMESTAMP_add_message_reactions.sql
# Edit the generated file
cargo sqlx migrate run    # apply locally
cargo sqlx prepare        # regenerate .sqlx/ offline metadata
git add migrations/ .sqlx/
```

---

## Pull Request Checklist

Before marking your PR as ready for review, confirm:

- [ ] `cargo fmt --check` passes
- [ ] `cargo clippy -- -D warnings` passes
- [ ] `cargo test` passes
- [ ] Frontend `npm run lint` passes (if frontend changes)
- [ ] Migration files and `.sqlx/` metadata are committed (if schema changes)
- [ ] `.env.example` is updated (if new env vars are added)
- [ ] README / docs are updated (if behaviour changes)
- [ ] PR description explains **what** changed and **why**

---

## Code of Conduct

Be kind and constructive. We follow the
[Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
