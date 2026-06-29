// scripts/localnet/down.mjs — stop the Umbra services (solver + web). The user's
// separate `augur` project on :4000 / :5432 is NEVER touched.
//   --localnet   also stop the Canton LocalNet containers (state KEPT in the volume)
//   --wipe       stop the LocalNet AND delete its volumes (destroys all ledger state)
import { execSync } from 'node:child_process'

const args = new Set(process.argv.slice(2))
const SOLVER_PORT = process.env.SOLVER_PORT ?? '4100'
const CN_DIR = (process.env.CN_QUICKSTART_DIR ?? 'C:/Users/woshv/Desktop/cn-quickstart').replace(/\\/g, '/')
const LOCALNET = `${CN_DIR}/quickstart/docker/modules/localnet`

const killPort = (port, label) => {
  let out = ''
  try {
    out = execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' }).toString()
  } catch {
    /* findstr exits non-zero when nothing matches */
  }
  const pids = [
    ...new Set(
      out
        .split('\n')
        .filter((l) => l.includes('LISTENING'))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => p && p !== '0'),
    ),
  ]
  if (!pids.length) {
    console.log(`  · ${label} (:${port}) not running`)
    return
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
      console.log(`  ✓ stopped ${label} (:${port}, pid ${pid})`)
    } catch {
      console.log(`  ! could not stop pid ${pid} (:${port})`)
    }
  }
}

console.log('▸ stopping Umbra services (augur on :4000/:5432 left untouched)')
killPort(SOLVER_PORT, 'solver')
killPort('5173', 'web')

if (args.has('--localnet') || args.has('--wipe')) {
  const flag = args.has('--wipe') ? '-v' : ''
  console.log(`▸ stopping Canton LocalNet${flag ? ' + deleting volumes (state wiped)' : ' (state kept)'}`)
  const env = { ...process.env, IMAGE_TAG: '0.5.3', PARTY_HINT: 'umbra-operator-1' }
  try {
    execSync(
      `docker compose -f compose.yaml -f umbra-localnet-override.yaml --env-file compose.env --env-file env/common.env --profile app-provider --profile app-user --profile sv --profile swagger-ui down ${flag}`,
      { cwd: LOCALNET, env, stdio: 'inherit' },
    )
  } catch {
    console.log('  ! docker compose down failed (LocalNet dir / docker?)')
  }
}
console.log('✓ done')
