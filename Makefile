# Umbra — dev/run orchestration (macOS/Linux).
#
# `make` is NOT installed on the Windows dev box. Every target below is mirrored
# as a root npm script — Windows users run `npm run <target>` (see package.json),
# or follow the manual 4-terminal flow documented in the README. The manual flow
# is the always-works, cross-platform contract; this Makefile is the convenience
# layer for macOS/Linux.
#
# PRIVACY INVARIANT (hard): no target writes/copies the operator token or the
# Anthropic key anywhere near web/. Desk tokens live ONLY in web/src/tokens.json;
# the operator token ONLY in scripts/.operator-token (CLI/solver, never web/src);
# ANTHROPIC_API_KEY is read ONLY by solver/. All three are gitignored — never
# committed. `clean` removes the per-boot ephemera; it commits nothing.

.DEFAULT_GOAL := help

# ─────────────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## List the available targets
	@echo "Umbra — make targets"
	@echo ""
	@echo "  make install         Install web + solver deps (web uses --legacy-peer-deps)"
	@echo "  make ledger          Boot Canton sandbox + JSON API :7575 (long-running; exports parties.json)"
	@echo "  make tokens          Mint per-party dev tokens (needs parties.json; run AFTER ledger is up)"
	@echo "  make solver          Run the AI solver HTTP service :4000 (needs scripts/.operator-token)"
	@echo "  make web             Run the Vite dev server :5173 (proxies /v1 -> :7575)"
	@echo "  make test            Run the Daml Script tests (self-contained; no daml start needed)"
	@echo "  make verify-privacy  Live per-party /v1/query wire check (needs ledger up + tokens minted)"
	@echo "  make clean           Remove per-boot ephemera + the Daml dist (keeps node_modules)"
	@echo "  make demo            Print the canonical 4-terminal flow (the always-works path)"
	@echo ""
	@echo "Ports: JSON API 7575 · solver 4000 · Vite 5173.   Canonical fixture clears at \$$100.00."

# ── Setup ────────────────────────────────────────────────────────────────────
.PHONY: install
install: ## Install web (--legacy-peer-deps) + solver dependencies
	cd web && npm install --legacy-peer-deps
	cd solver && npm install

# ── The four run processes (each in its own terminal) ────────────────────────
.PHONY: ledger
ledger: ## Boot the Canton sandbox + HTTP JSON API on :7575 (long-running)
	cd daml && daml start

.PHONY: tokens
tokens: ## Mint desk tokens -> web/src/tokens.json + operator token -> scripts/.operator-token
	node scripts/mint-tokens.mjs

.PHONY: solver
solver: ## Run the AI solver HTTP service on :4000
	cd solver && npm run dev

.PHONY: web
web: ## Run the Vite frontend dev server on :5173
	cd web && npm run dev

# ── Tests / verification ─────────────────────────────────────────────────────
.PHONY: test
test: ## Run the Daml Script tests (self-contained — no daml start needed)
	cd daml && daml test

.PHONY: verify-privacy
verify-privacy: ## Live wire-level per-party privacy check (ledger up + tokens minted)
	node scripts/verify-privacy.mjs

# ── Housekeeping ─────────────────────────────────────────────────────────────
# Conservative clean: only gitignored per-boot ephemera + the Daml dist.
# NEVER removes node_modules. All four removed paths are gitignored and re-created
# on the next boot/mint; nothing here is committed.
.PHONY: clean
clean: ## Remove per-boot ephemera (parties.json, tokens, operator token) + the Daml dist
	rm -rf daml/.daml/dist
	rm -f daml/parties.json
	rm -f web/src/tokens.json
	rm -f scripts/.operator-token

# ── Composite one-liner ──────────────────────────────────────────────────────
# Per 07-RESEARCH (open-question 1, chosen): document-the-flow + best-effort.
# `daml start` blocks and tokens depend on parties.json, so demo CANNOT naively
# &&-chain four long-running processes. The manual 4-terminal flow IS the contract;
# this target prints it (the always-works path). Robust cross-platform background-
# PID juggling on a JVM boot is intentionally NOT the documented contract.
.PHONY: demo
demo: ## Print the canonical 4-terminal demo flow (the always-works path)
	@echo "════════════════════════════════════════════════════════════════════"
	@echo " Umbra demo — the canonical 4-terminal flow (recommended, always works)"
	@echo "════════════════════════════════════════════════════════════════════"
	@echo ""
	@echo "  Terminal 1   cd daml && daml start          # wait for :7575 + daml/parties.json"
	@echo "  Terminal 2   node scripts/mint-tokens.mjs   # after the ledger is up"
	@echo "  Terminal 3   cd solver && npm run dev        # Express :4000"
	@echo "  Terminal 4   cd web && npm run dev           # Vite  :5173"
	@echo ""
	@echo "  Then open http://localhost:5173  → the 3-up Privacy view → clear at \$$100.00 → atomic settle."
	@echo ""
	@echo "  (Windows / no make: run each line, or use 'npm run ledger|tokens|solver|web'.)"
	@echo "════════════════════════════════════════════════════════════════════"
