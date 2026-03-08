# Multi-Dev Coordination Protocol

> Drop this into your project's CLAUDE.md or reference it from there.
> Designed for multiple Claude Code instances (or human + Claude) working on the same repo with git as the single source of truth.

---

## 1. Branch Strategy

### Rules
- **Never push directly to `main`.** All work happens on feature branches.
- **One branch per task.** Never have two devs working on the same branch.
- **Merge via PR only.** Every branch merges to `main` through a pull request — no direct merges.
- **Pull before you branch.** Always branch from the latest `main`.

### Branch Naming
```
<dev-id>/<type>/<short-description>

Examples:
  dev-1/feat/ossy-chat-streaming
  dev-2/fix/auth-redirect-loop
  dev-1/refactor/billing-gate
```

**Types:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`

### Lifecycle
```
1. git checkout main && git pull origin main
2. git checkout -b <dev-id>/<type>/<description>
3. Work, commit often with clear messages
4. Push branch, open PR against main
5. Other dev reviews if available, or self-merge if clean
6. Delete branch after merge
```

---

## 2. Area Ownership

Assign each dev primary ownership of directories/features to minimize conflicts. Only one dev should be modifying a given area at a time.

### How to Assign
Define ownership in your project's CLAUDE.md like this:

```
## Dev Assignments
- **Dev 1:** src/lib/ai/, src/app/(app)/chat/, src/components/chat-*
- **Dev 2:** src/lib/db/, src/app/api/admin/, src/app/(admin)/
```

### Shared/Contested Files
Some files are touched by everyone. Handle these with extra care:
- **Schema files** (database, API types) — coordinate before modifying
- **Root layout/config** (`layout.tsx`, `next.config.ts`, `package.json`) — keep changes minimal, commit separately
- **Shared utilities** (`lib/utils.ts`, `lib/env.ts`) — additive only, never rename/restructure without coordinating
- **CLAUDE.md** — only one dev updates it at a time

### Rule of Thumb
If your task requires editing a file outside your assigned area, mention it to the other dev before starting.

---

## 3. Schema & Migration Discipline

Database schema changes are the #1 source of conflicts in multi-dev setups.

### Rules
- **One schema change at a time.** Never have two devs modifying `schema.ts` or migrations simultaneously.
- **Announce before starting.** Before touching schema, confirm the other dev isn't also mid-migration.
- **Commit schema changes in isolation.** Don't bundle schema changes with feature code in the same commit.
- **Push migrations immediately.** Once a migration is generated, push the branch so the other dev can pull it.
- **Never edit existing migrations.** Only add new ones.

### Workflow
```
1. Pull latest main (get all current migrations)
2. Modify schema.ts
3. Run migration generation (e.g., npm run db:generate)
4. Test locally
5. Commit schema + migration files together
6. Push and PR immediately — don't let it sit
```

---

## 4. Commit Hygiene

### Message Format
```
<type>: <what changed>

Optional body explaining why, not what.
```

Examples:
```
feat: add voice streaming to Ossy chat panel
fix: prevent duplicate partnership records on rapid clicks
refactor: extract billing gate into standalone module
chore: update drizzle to 0.46.0
```

### Rules
- **Commit often.** Small, focused commits are easier to review and revert.
- **One concern per commit.** Don't mix a bug fix with a refactor.
- **Never commit `.env` or secrets.** Check `.gitignore` covers all sensitive files.
- **Don't commit generated files** (`node_modules`, `.next`, `drizzle/meta`) — these should be gitignored.

---

## 5. Dependency Management

### Rules
- **Coordinate new dependencies.** Before running `npm install <new-package>`, mention it — the other dev needs to know.
- **Commit `package-lock.json` with `package.json`.** Always together, never separately.
- **Don't upgrade existing packages** unless that's your assigned task. Surprise upgrades cause surprise breakage.

### Resolving Lock File Conflicts
If `package-lock.json` conflicts on merge:
```
1. Accept the version from main
2. Run npm install (regenerates lock from merged package.json)
3. Commit the result
```

---

## 6. Communication Protocol

Since Claude Code instances can't talk to each other directly, use these mechanisms:

### Git Commit Messages
Your primary communication channel. Write messages that tell the other dev what happened and why.

### CLAUDE.md Updates
If you establish a new pattern, convention, or architectural decision — add it to CLAUDE.md so the other dev picks it up.

### Coordination File (Optional)
For active coordination, maintain a `STATUS.md` at the project root:

```markdown
# Dev Status

## Dev 1 (Instance A)
- **Currently working on:** Ossy chat streaming
- **Branch:** dev-1/feat/ossy-chat-streaming
- **Blocking/needs from other dev:** None
- **Files I'm modifying:** src/lib/ai/*, src/components/chat-panel.tsx

## Dev 2 (Instance B)
- **Currently working on:** Admin dashboard metrics
- **Branch:** dev-2/feat/admin-metrics
- **Blocking/needs from other dev:** Need billing schema finalized
- **Files I'm modifying:** src/app/(admin)/*, src/app/api/admin/*
```

Update this before starting and after completing each task.

### PR Descriptions
Write PRs as if the other dev is your reviewer. Include:
- What changed and why
- Files modified
- Any schema changes
- Any new dependencies
- Anything the other dev should know

---

## 7. Conflict Prevention

### Before Starting Work
```
1. git checkout main && git pull
2. Check STATUS.md or ask what the other dev is working on
3. Confirm no overlap in files/areas
4. Create your branch and go
```

### Before Merging
```
1. git checkout main && git pull
2. git checkout <your-branch> && git rebase main
3. Resolve any conflicts
4. Test that everything builds (npm run build)
5. Push and merge PR
```

### If Conflicts Happen
- **Small conflicts** (imports, adjacent lines): resolve and move on
- **Large conflicts** (same function/component modified): coordinate with the other dev, decide whose version to keep, manually merge logic
- **Schema conflicts**: stop, coordinate, one dev takes priority

---

## 8. Testing & Build Checks

### Before Every PR
```bash
npm run build          # Must pass — catches type errors
npm run lint           # Must pass — catches style issues
```

### Rules
- Never merge a PR that doesn't build.
- If your change breaks the build, fix it before pushing — don't leave it for the other dev.
- If you pull main and it's broken, notify the other dev immediately.

---

## 9. Quick Reference Checklist

**Starting a task:**
- [ ] Pull latest main
- [ ] Check what the other dev is working on
- [ ] Create a branch with proper naming
- [ ] Update STATUS.md

**During work:**
- [ ] Commit often with clear messages
- [ ] Stay in your assigned area
- [ ] Coordinate before touching shared files
- [ ] Don't install packages without mentioning it

**Finishing a task:**
- [ ] Rebase on latest main
- [ ] Run build + lint
- [ ] Push branch, open PR with good description
- [ ] Update STATUS.md
- [ ] Update CLAUDE.md if you established new patterns

---

## 10. Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Push directly to main | Use feature branches + PRs |
| Work on the same file as the other dev | Coordinate ownership |
| Make "drive-by" fixes in unrelated files | Create a separate branch/PR for those |
| Let branches live for days | Merge early and often |
| Rename or restructure shared modules without warning | Coordinate first |
| Bundle schema changes with feature work | Separate commits and PRs |
| Assume the other dev knows what you changed | Write clear commit messages and PR descriptions |
| Force push to shared branches | Only force push your own branches |
