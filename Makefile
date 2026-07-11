# Umbra — dev/run orchestration on real Canton (Daml 3.4 + LocalNet + JSON Ledger API v2).
#
# `make` is NOT installed on the Windows dev box; every target is mirrored as a root
# npm script (`npm run <target>`) — and the real work lives in cross-platform Node
# scripts under scripts/localnet/, so `node scripts/localnet/up.mjs` works anywhere.
#
# PRIVACY INVARIANT (hard): no target writes/copies the operator token or the Anthropic
# key near web/. Desk tokens live ONLY in web/src/tokens.json; the operator token ONLY
# in scripts/.operator-token; ANTHROPIC_API_KEY is read ONLY by solver/. All gitignored.

.DEFAULT_GOAL := help

.PHONY: help
help: ## List the available targets
	@echo "Umbra — make targets (Canton LocalNet + JSON Ledger API v2)"
	@echo ""
	@echo "  make up           One-command bring-up: LocalNet + DAR + deploy + seed + solver + web"
	@echo "  make up-xnode     Same, with the three desks on SEPARATE participant nodes (§19)"
	@echo "  make down         Stop solver + web (LocalNet kept; augur on :4000 untouched)"
	@echo "  make down-localnet  Also stop the Canton LocalNet (ledger state kept)"
	@echo ""
	@echo "  make deploy       Upload the DAR to all participants + allocate parties/users/tokens"
	@echo "  make seed         Seed the §4 Round R1 (single-node) + prove per-desk privacy"
	@echo "  make xnode        Distribute desks across nodes + seed R1 cross-node (browser)"
	@echo ""
	@echo "  make verify       On-ledger §4 balances + conservation + confirmation privacy"
	@echo "  make verify-live  Bulletproof the browser paths: live submit + close->settle"
	@echo "  make moneyshot    Headless proof of the full §4 flow across three nodes"
	@echo "  make test         Daml model tests (daml build && daml test, via Git Bash)"
	@echo "  make solver-test  Solver unit tests (351 across 27 files)"
	@echo "  make web-build    Frontend typecheck + production build"
	@echo ""
	@echo "  make install      Install web (--legacy-peer-deps) + solver deps"
	@echo "  make clean        Remove gitignored per-deploy ephemera + the Daml dist"
	@echo ""
	@echo "Ports: Canton v2 3975/2975/4975 · solver 4100 · web 5173 · swagger 9090.  Clears at \$$100.00."

# ── Bring-up / teardown ──────────────────────────────────────────────────────
.PHONY: up up-xnode down down-localnet
up: ## One-command bring-up (single-node desks)
	node scripts/localnet/up.mjs
up-xnode: ## Bring-up with desks on three separate participant nodes (§19)
	node scripts/localnet/up.mjs --xnode
down: ## Stop solver + web (LocalNet kept)
	node scripts/localnet/down.mjs
down-localnet: ## Stop solver + web AND the Canton LocalNet (state kept)
	node scripts/localnet/down.mjs --localnet

# ── Deploy / seed ────────────────────────────────────────────────────────────
.PHONY: deploy seed xnode compliance
deploy: ## Upload DAR to all participants + allocate parties/users/tokens + four-eyes compliance
	node scripts/localnet/deploy.mjs
	node scripts/localnet/provision-compliance.mjs
compliance: ## (Re)provision the DISTINCT four-eyes compliance authority (scripts/.compliance-token)
	node scripts/localnet/provision-compliance.mjs
seed: ## Seed the canonical §4 Round R1 (single-node) + privacy proof
	node scripts/localnet/seed.mjs
xnode: ## Distribute desks across nodes + seed R1 cross-node + write the browser config
	node scripts/localnet/xnode-up.mjs

# ── Verify / test ────────────────────────────────────────────────────────────
.PHONY: verify verify-live moneyshot test solver-test web-build
verify: ## On-ledger §4 balances + conservation + confirmation privacy
	node scripts/localnet/verify-settlement.mjs
verify-live: ## Bulletproof the browser paths (live submit + close->settle)
	node scripts/localnet/verify-live-flow.mjs
moneyshot: ## Headless proof of the full §4 flow across three nodes
	node scripts/localnet/xnode-moneyshot.mjs
test: ## Daml model tests (run via Git Bash — daml is on the Bash PATH)
	cd daml && daml build && daml test
solver-test: ## Solver unit tests
	cd solver && npm test
web-build: ## Frontend typecheck + production build
	cd web && npm run build

# ── Setup / housekeeping ─────────────────────────────────────────────────────
.PHONY: install clean
install: ## Install web (--legacy-peer-deps) + solver dependencies
	cd web && npm install --legacy-peer-deps
	cd solver && npm install
clean: ## Remove gitignored per-deploy ephemera + the Daml dist (keeps node_modules)
	rm -rf daml/.daml/dist
	rm -f daml/parties.json web/src/tokens.json scripts/.operator-token scripts/localnet/.deploy.json
