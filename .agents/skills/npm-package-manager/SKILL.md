---
name: npm-package-manager
description: Manage npm packages safely, including installs, removals, updates, audits, lockfile discipline, and supply-chain security checks.
---

# NPM Package Manager Skill

Use this skill when the user asks to add, remove, update, audit, inspect, or troubleshoot npm packages in a Node.js project.

## Core rules

1. Detect the package manager before acting.
   - If `package-lock.json` exists, use npm.
   - If `pnpm-lock.yaml`, `yarn.lock`, or `bun.lockb` exists, stop and ask before using npm.
   - Do not mix package managers.

2. Prefer safe, minimal changes.
   - Modify only `package.json` and `package-lock.json` unless asked otherwise.
   - Do not delete `node_modules`, lockfiles, or config files unless explicitly approved.
   - Explain major dependency changes before applying them.

3. Use the right command.
   - Runtime dependency: `npm install <package>`
   - Dev dependency: `npm install -D <package>`
   - Remove dependency: `npm uninstall <package>`
   - Clean reproducible install: `npm ci`
   - Check outdated packages: `npm outdated`
   - Security audit: `npm audit`
   - Structured audit: `npm audit --json`
   - Lockfile only: `npm install --package-lock-only`

## Security rules

1. Always consider supply-chain risk before adding a package.
   Check for:
   - Typosquatting or confusing package name
   - Very new package
   - Low downloads or little adoption
   - Recent ownership transfer
   - Unusual install scripts
   - Missing repository, license, or changelog
   - Large or surprising dependency tree
   - Deprecated package notice
   - Known vulnerabilities

2. Run audit checks when dependencies change.
   - Run `npm audit`
   - Use `npm audit --audit-level=high` in CI-style checks
   - Use `npm audit --json` when detailed analysis is needed

3. Treat automatic fixes carefully.
   - `npm audit fix` is allowed only after reviewing the proposed changes.
   - `npm audit fix --force` must not be run without explicit user approval.
   - Explain breaking-change risk before forced fixes.

4. Verify package signatures when appropriate.
   - Run `npm audit signatures` for registry signature checks.
   - Treat failures or missing signatures as a risk signal requiring review.

5. Preserve lockfile security.
   - Keep `package-lock.json` committed.
   - Use `npm ci` for CI and clean installs.
   - Do not delete the lockfile to resolve conflicts unless the user approves.

6. Be cautious with lifecycle scripts.
   - Inspect suspicious packages for `preinstall`, `install`, or `postinstall` scripts.
   - Do not run unknown package scripts manually unless necessary.
   - Consider `npm install --ignore-scripts` for investigation.

7. Prefer maintained packages.
   - Prefer packages with active maintenance.
   - Prefer packages with clear repository links.
   - Prefer packages with recent releases and responsive issue handling.
   - Avoid abandoned packages when reasonable alternatives exist.

## Recommended CI security check

Use this pattern in CI:

```bash
npm ci
npm audit --audit-level=high
npm test
npm run build