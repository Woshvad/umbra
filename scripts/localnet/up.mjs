// scripts/localnet/up.mjs — ONE-COMMAND bring-up for the whole Umbra live stack on
// real Canton. Idempotent + sleep/restart-safe:
//   1. Canton LocalNet (docker compose, health-gated; recovers a slept/restarted box)
//   2. DAR vetted on all 3 participants (built via `daml build` if missing)
//   3. parties/users/tokens (deploy.mjs) + the §4 Round R1 seeded — single-node by
//      default, or cross-node desks with `--xnode`. State PERSISTS across restarts, so
//      a re-seed is skipped unless R1 is gone or you pass `--reseed`.
//   4. solver (:4100 — augur owns :4000 on this box) + web (:5173), launched detached.
//
// Flags:  --xnode   distribute desks across nodes (§19 in the browser)
//         --reseed  force a fresh §4 seed even if R1 already exists
// Env:    CN_QUICKSTART_DIR (LocalNet repo), SOLVER_PORT (default 4100)
import { execSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mintJwt } from './mint-jwt.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')
const args = new Set(process.argv.slice(2))
const XNODE = args.has('--xnode')
const RESEED = args.has('--reseed')

const CN_DIR = (process.env.CN_QUICKSTART_DIR ?? 'C:/Users/woshv/Desktop/cn-quickstart').replace(/\\/g, '/')
const LOCALNET = `${CN_DIR}/quickstart/docker/modules/localnet`
const SOLVER_PORT = process.env.SOLVER_PORT ?? '4100'
const PROVIDER = 'http://localhost:3975'

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const status = async (url) => {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(4000) })).status
  } catch {
    return 0
  }
}
const node = (script, extra = '') => sh(`node scripts/localnet/${script}${extra ? ' ' + extra : ''}`, { cwd: repoRoot })

// ── 1. Canton LocalNet ────────────────────────────────────────────────────────────
console.log('▸ Canton LocalNet')
if ((await status(`${PROVIDER}/readyz`)) !== 200) {
  if (!existsSync(LOCALNET)) {
    console.error(`  ✗ LocalNet not found at ${LOCALNET} and :3975 is down.\n    Set CN_QUICKSTART_DIR or start the LocalNet, then re-run.`)
    process.exit(1)
  }
  const compose =
    'docker compose -f compose.yaml -f umbra-localnet-override.yaml --env-file compose.env ' +
    '--env-file env/common.env --profile app-provider --profile app-user --profile sv --profile swagger-ui up -d'
  const env = { ...process.env, IMAGE_TAG: '0.5.3', PARTY_HINT: 'umbra-operator-1' }
  console.log('  docker compose up -d (canton can take ~1–2 min to rehydrate)…')
  try {
    sh(compose, { cwd: LOCALNET, env })
  } catch {
    /* the dependency health-gate can abort while canton boots — we poll below */
  }
  process.stdout.write('  waiting for :3975 ')
  for (let i = 0; i < 48; i++) {
    if ((await status(`${PROVIDER}/readyz`)) === 200) break
    if (i === 14) {
      try {
        sh(compose, { cwd: LOCALNET, env })
      } catch {
        /* nudge stragglers once canton is healthy */
      }
    }
    process.stdout.write('.')
    await sleep(5000)
  }
  process.stdout.write('\n')
}
if ((await status(`${PROVIDER}/readyz`)) !== 200) {
  console.error('  ✗ participant :3975 never became ready — check `docker logs canton`')
  process.exit(1)
}
console.log('  ✓ participants up (:3975/:2975/:4975)')

// ── 2. DAR ──────────────────────────────────────────────────────────────────────
const DAR = resolve(repoRoot, 'daml', '.daml', 'dist', 'umbra-0.1.0.dar')
if (!existsSync(DAR)) {
  console.log('▸ building DAR (daml build)')
  // `daml` must be on PATH. `bash -lc` sources the login profile, which on a typical box
  // already exposes `daml` (e.g. a ~/bin shim). Set DAML_BIN to prepend a custom location;
  // when unset we use the caller's existing login PATH (no hardcoded personal path).
  const damlBin = process.env.DAML_BIN?.replace(/\\/g, '/')
  const pathPrefix = damlBin ? `export PATH='${damlBin}':$PATH && ` : ''
  try {
    sh(`bash -lc "${pathPrefix}cd daml && daml build"`, { cwd: repoRoot })
  } catch {
    console.error('  ✗ daml build failed — build it in Git Bash: `cd daml && daml build`, then re-run\n    (or set DAML_BIN to the dir containing `daml` and re-run)')
    process.exit(1)
  }
}

// ── 3. deploy + seed (state persists; skip seed unless missing / --reseed) ─────────
const r1Exists = async () => {
  try {
    const parties = JSON.parse(readFileSync(resolve(repoRoot, 'daml', 'parties.json'), 'utf8'))
    const token = mintJwt('ledger-api-user')
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const { offset } = await (await fetch(`${PROVIDER}/v2/state/ledger-end`, { headers: h })).json()
    const acs = await (
      await fetch(`${PROVIDER}/v2/state/active-contracts`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ filter: { filtersByParty: { [parties.operator]: {} } }, verbose: true, activeAtOffset: offset }),
      })
    ).json()
    return (Array.isArray(acs) ? acs : []).some(
      (e) => e?.contractEntry?.JsActiveContract?.createdEvent?.createArgument?.roundId === 'R1',
    )
  } catch {
    return false
  }
}

if (RESEED || !(await r1Exists())) {
  // Fresh setup (or forced): deploy.mjs vets the DAR + allocates base parties/users/
  // tokens + writes single-node config; then the seed writes the mode-specific config
  // (xnode-up overwrites with cross-node bases) and seeds R1. Both run together so the
  // config + R1 always match.
  console.log('▸ deploy (DAR vet on all participants + parties/users/tokens)')
  node('deploy.mjs')
  console.log(`▸ seed §4 Round R1 (${XNODE ? 'cross-node' : 'single-node'})`)
  node(XNODE ? 'xnode-up.mjs' : 'seed.mjs')
} else {
  console.log('▸ Round R1 present (state persisted) — skipping deploy + seed (use --reseed to force)')
}

// ── 4. solver + web (launched detached) ────────────────────────────────────────────
const launch = (label, cmd, cwd, extraEnv) => {
  const p = spawn(cmd, { cwd, env: { ...process.env, ...extraEnv }, detached: true, stdio: 'ignore', shell: true })
  p.unref()
  console.log(`  ✓ ${label} launched (pid ${p.pid})`)
}
console.log('▸ services')
if ((await status(`http://localhost:${SOLVER_PORT}/round/R1`)) === 0) {
  launch(`solver :${SOLVER_PORT}`, 'npx tsx src/index.ts', resolve(repoRoot, 'solver'), { SOLVER_PORT })
} else console.log(`  ✓ solver already on :${SOLVER_PORT}`)
if ((await status('http://localhost:5173/')) === 0) {
  launch('web :5173', 'npm run dev', resolve(repoRoot, 'web'), {})
} else console.log('  ✓ web already on :5173')

// wait for services to answer
process.stdout.write('  warming up ')
for (let i = 0; i < 24; i++) {
  if ((await status(`http://localhost:${SOLVER_PORT}/round/R1`)) > 0 && (await status('http://localhost:5173/')) === 200) break
  process.stdout.write('.')
  await sleep(2500)
}
process.stdout.write('\n')

// Report the ACTUAL mode (from tokens.json), which is accurate even when seeding was
// skipped because state persisted.
let mode = 'single-node desks'
try {
  if (JSON.parse(readFileSync(resolve(repoRoot, 'web', 'src', 'tokens.json'), 'utf8')).bankA?.base)
    mode = 'cross-node desks (bankA@app-user · bankB@sv · bankC@app-provider)'
} catch {
  /* tokens.json may be absent before the first deploy */
}
console.log(`\n✓ Umbra is up — open http://localhost:5173`)
console.log(`  solver :${SOLVER_PORT} · web :5173 · Canton v2 :3975/:2975/:4975 · swagger :9090`)
console.log(`  ${mode} · stop with: node scripts/localnet/down.mjs`)
