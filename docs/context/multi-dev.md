# 17. Multi-Dev Coordination

> Last updated: 2026-03-09

Living reference for all Claude Code instances working on the COS CONCEPT 2 repo simultaneously. Source of truth: `docs/MULTI-DEV-COORDINATION.md` and the "Multi-Dev Coordination Rules" section of `CLAUDE.md`.

---

## The 16 Coordination Rules

1. **Pull before every push.** Always `git pull --rebase origin main` before pushing. Read changed files from other devs to avoid conflicts.
2. **One branch per task, one dev per branch.** Never have two devs on the same branch. Use branches when conflict risk is high.
3. **Branch naming:** `<dev-id>/<type>/<short-description>` (e.g., `dev-1/feat/ossy-chat`). Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`.
4. **Always branch from latest main.** Pull before you branch.
5. **Assign area ownership.** Each dev owns specific directories/features. Stay in your lane. If you need to edit outside your area, coordinate first.
6. **Schema changes are serialized.** Only one dev modifies database schema/migrations at a time. Commit schema changes separately from feature code. Push immediately.
7. **Never edit existing migrations.** Only add new ones.
8. **Coordinate new dependencies.** Don't `npm install` new packages without mentioning it. Always commit `package-lock.json` with `package.json`.
9. **Commit often, commit small.** One concern per commit. Clear messages: `<type>: <what changed>`.
10. **Build + lint must pass before every PR.** Never merge a broken build.
11. **Rebase on main before merging.** Resolve conflicts on your branch, not on main.
12. **Update CLAUDE.md when you establish new patterns.** This is how you communicate decisions to other devs.
13. **Keep a STATUS.md** at project root listing each dev's current branch, task, and files being modified. Update it before starting and after finishing each task.
14. **Don't make drive-by fixes.** If you spot something outside your task, make a separate branch/PR.
15. **Don't let branches live for days.** Merge early and often to avoid drift.
16. **Always pull before push.** (Intentional repeat of Rule 1 for emphasis -- this is non-negotiable.)

---

## Branch Naming Convention

```
<dev-id>/<type>/<short-description>
```

**Format:**
- `dev-id` -- identifier for the Claude instance or human developer (e.g., `dev-1`, `dev-2`, `dev-3`)
- `type` -- one of: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`
- `short-description` -- kebab-case summary of the work

**Examples:**
```
dev-1/feat/ossy-chat-streaming
dev-2/fix/auth-redirect-loop
dev-1/refactor/billing-gate
dev-3/chore/update-drizzle
```

**Branch lifecycle:**
1. `git checkout main && git pull origin main`
2. `git checkout -b <dev-id>/<type>/<description>`
3. Work and commit often with clear messages
4. Push branch, open PR against main
5. Other dev reviews if available, or self-merge if clean
6. Delete branch after merge

---

## Pre-Push Sync Rule (Mandatory)

This is the single most important rule. Before EVERY commit or push:

1. `git fetch origin && git pull --rebase origin main` -- pull latest changes first.
2. Read any files changed by other devs (`git log --oneline HEAD..origin/main` to see incoming commits).
3. Review the diff for conflicts with your work -- especially shared files like API routes, schema, and layout. Never blindly accept "ours" or "theirs".
4. If other devs have modified files you also changed, review their changes before overwriting.
5. Run `next build` after resolving any conflicts to ensure nothing is broken.
6. Only then push.

Skipping this step causes merge conflicts, broken deploys, and lost work. Three Claude instances may be pushing concurrently.

---

## Schema Change Serialization Protocol

Database schema changes are the #1 source of conflicts in multi-dev setups. They are serialized -- only one dev may touch schema at a time.

**Rules:**
- One schema change at a time. Never have two devs modifying `schema.ts` or migrations simultaneously.
- Announce before starting. Confirm the other dev is not mid-migration.
- Commit schema changes in isolation. Do not bundle with feature code in the same commit.
- Push migrations immediately. Once generated, push the branch so other devs can pull it.
- Never edit existing migrations. Only add new ones.

**Workflow:**
1. Pull latest main (get all current migrations)
2. Modify `src/lib/db/schema.ts`
3. Run `npm run db:generate`
4. Test locally
5. Commit schema + migration files together (but separate from feature code)
6. Push and PR immediately -- do not let it sit

---

## Area Ownership

Each dev is assigned primary ownership of directories/features to minimize conflicts. Only one dev should modify a given area at a time.

**Assignment format** (defined in CLAUDE.md or STATUS.md):
```
- Dev 1: src/lib/ai/, src/app/(app)/chat/, src/components/chat-*
- Dev 2: src/lib/db/, src/app/api/admin/, src/app/(admin)/
- Dev 3: ...
```

**Rule of thumb:** If your task requires editing a file outside your assigned area, mention it to the other dev before starting.

---

## STATUS.md Requirements

Maintain a `STATUS.md` file at the project root. Each dev updates it before starting and after completing each task.

**Required fields per dev:**
```markdown
## Dev N (Instance X)
- **Currently working on:** <task description>
- **Branch:** <dev-id>/<type>/<description>
- **Blocking/needs from other dev:** <dependencies or "None">
- **Files I'm modifying:** <list of paths>
```

This is the primary coordination mechanism since Claude Code instances cannot communicate directly with each other.

---

## Shared / Contested Files

These files are touched by everyone and require extra care:

| File | Handling |
|------|----------|
| `src/lib/db/schema.ts` | Serialized -- only one dev at a time. Announce before modifying. |
| `src/app/layout.tsx` | Keep changes minimal. Commit separately from feature work. |
| `package.json` | Coordinate new dependencies. Commit with `package-lock.json`. |
| `CLAUDE.md` | Only one dev updates at a time. Used to communicate patterns/decisions. |
| `src/lib/utils.ts`, `src/lib/env.ts` | Additive only. Never rename or restructure without coordinating. |
| `next.config.ts` | Keep changes minimal. Commit separately. |

---

## Conflict Resolution Process

### Prevention (before starting work)
1. `git checkout main && git pull`
2. Check STATUS.md or ask what other devs are working on
3. Confirm no overlap in files/areas
4. Create your branch and begin

### Prevention (before merging)
1. `git checkout main && git pull`
2. `git checkout <your-branch> && git rebase main`
3. Resolve any conflicts on your branch (not on main)
4. Test that everything builds: `npm run build`
5. Push and merge PR

### When conflicts occur
- **Small conflicts** (imports, adjacent lines): resolve and move on.
- **Large conflicts** (same function/component modified): coordinate with the other dev, decide whose version to keep, manually merge logic.
- **Schema conflicts**: full stop. Coordinate. One dev takes priority.
- **`package-lock.json` conflicts**: accept the version from main, run `npm install` to regenerate, commit the result.

---

## Commit Message Conventions

**Format:**
```
<type>: <what changed>

Optional body explaining why, not what.
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`

**Examples:**
```
feat: add voice streaming to Ossy chat panel
fix: prevent duplicate partnership records on rapid clicks
refactor: extract billing gate into standalone module
chore: update drizzle to 0.46.0
```

**Rules:**
- Commit often. Small, focused commits are easier to review and revert.
- One concern per commit. Do not mix a bug fix with a refactor.
- Never commit `.env` or secrets. Verify `.gitignore` covers all sensitive files.
- Do not commit generated files (`node_modules`, `.next`, `drizzle/meta`).

---

## Build / Lint Requirements Before Merge

Before every PR merge, the following must pass:

```bash
npm run build    # Catches type errors, ensures production build succeeds
npm run lint     # Catches style issues and code quality problems
```

**Rules:**
- Never merge a PR that does not build.
- If your change breaks the build, fix it before pushing -- do not leave it for other devs.
- If you pull main and it is broken, notify the other dev immediately.

---

## Anti-Patterns

| Do Not | Do Instead |
|--------|------------|
| Push directly to main | Use feature branches + PRs |
| Work on the same file as another dev | Coordinate ownership |
| Make drive-by fixes in unrelated files | Create a separate branch/PR |
| Let branches live for days | Merge early and often |
| Rename/restructure shared modules without warning | Coordinate first |
| Bundle schema changes with feature work | Separate commits and PRs |
| Assume other devs know what you changed | Write clear commit messages and PR descriptions |
| Force push to shared branches | Only force push your own branches |

---

## Quick Reference Checklist

**Starting a task:**
- [ ] Pull latest main
- [ ] Check what other devs are working on (STATUS.md)
- [ ] Create a branch with proper naming
- [ ] Update STATUS.md

**During work:**
- [ ] Commit often with clear messages
- [ ] Stay in your assigned area
- [ ] Coordinate before touching shared files
- [ ] Do not install packages without mentioning it

**Finishing a task:**
- [ ] Rebase on latest main
- [ ] Run `npm run build` + `npm run lint`
- [ ] Push branch, open PR with good description
- [ ] Update STATUS.md
- [ ] Update CLAUDE.md if you established new patterns
