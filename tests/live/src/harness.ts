import { spawnSync } from 'child_process'

export const CT = process.env.KINDPOOL_CONTRACT_ID ?? 'CCRSLQSTTVMLUIU3I3TU2GRUFPUNCPGFLSFOTDWEVUF65V6PQBLOGNT2'
export const USDC = process.env.KINDPOOL_USDC ?? 'CD2CIUPXUDF3HFTBMKBS7SKAPNUGC4V2ZWJMBA2MG6GY76BKZN7OIYEY'
export const DEP = 'GAPCUR73ENAZ6RVFEUIGEEPKBRJWSVQ7N6INTJ56AYZB4BLNVRPMMFJP'
export const ATT = 'GCCWMTFMGWUBHS75VVPQSORIHGJZW3A57GN5TREFJIXR4JL4L6QFWC3D'
export const SUPB = 'GCIRZQ64PDFPI422IHJ3ZQ4LS2QVWF63BNVKPETEC3KDPVG4LOLHMJYA'
export const SUPC = 'GA4HESRPSVM7PLTCJOC5OTA2FNZIUKG5EJ5W6EAVSHEH52VNLFY7AVHA'
export const NET = 'testnet'

export const META = '1111111111111111111111111111111111111111111111111111111111111111'
export const WORK = '2222222222222222222222222222222222222222222222222222222222222222'
export const EVID = '3333333333333333333333333333333333333333333333333333333333333333'

export interface CheckResult {
  suite: string
  check: string
  status: 'PASS' | 'FAIL'
  detail: string
}

export const results: CheckResult[] = []

export function invoke(account: string, ...args: string[]): string {
  const flat = args.flatMap((a) => a.split(/\s+/).filter(Boolean))
  const cliArgs = ['contract', 'invoke', '--id', CT, '--source-account', account, '--network', NET, '--', ...flat]
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync('stellar', cliArgs, { encoding: 'utf8' })
    const stdout = (r.stdout ?? '').trim()
    const stderr = (r.stderr ?? '').trim()
    const combined = stdout || stderr
    if (r.status !== 0) {
      if (combined.includes('WasmVm') || combined.includes('simulation failed') || combined.includes('rate')) {
        if (attempt < 2) { spawnSync('sleep', ['2']); continue }
      }
      return combined
    }
    return stdout || (stderr.includes('Success') ? 'Success' : stderr)
  }
  return 'ERROR: invoke retries exhausted'
}

export function check(suite: string, label: string, expected: string, actual: string): void {
  const pass = new RegExp(expected).test(actual)
  results.push({ suite, check: label, status: pass ? 'PASS' : 'FAIL', detail: actual.slice(0, 200) })
  console.log(`  ${pass ? '✅' : '❌'} ${label}${pass ? '' : ` — got [${actual.slice(0, 120)}]`}`)
}

export function createPool(goal: number, deadlineDeltaSec: number, account = 'kindlepool-deployer'): number {
  const deadline = Math.floor(Date.now() / 1000) + deadlineDeltaSec
  const out = invoke(account, 'create', `--creator ${DEP}`, `--goal ${goal}`, `--deadline ${deadline}`, `--token ${USDC}`, `--metadata_hash ${META}`)
  const id = parseInt(out.match(/\d+/)?.[0] ?? '-1', 10)
  if (id < 1) throw new Error(`create failed: ${out}`)
  return id
}

export function poolState(poolId: number): any {
  const out = invoke('kindlepool-deployer', 'get_pool', `--pool_id ${poolId}`)
  try {
    const parsed = JSON.parse(out)
    return parsed ?? {}
  } catch { return {} }
}

export function usdcInvoke(account: string, ...args: string[]): string {
  const flat = args.flatMap((a) => a.split(/\s+/).filter(Boolean))
  const cliArgs = ['contract', 'invoke', '--id', USDC, '--source-account', account, '--network', NET, '--', ...flat]
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync('stellar', cliArgs, { encoding: 'utf8' })
    const stdout = (r.stdout ?? '').trim()
    const stderr = (r.stderr ?? '').trim()
    const combined = stdout || stderr
    if (r.status !== 0) {
      if (combined.includes('WasmVm') || combined.includes('simulation failed') || combined.includes('rate')) {
        if (attempt < 2) { spawnSync('sleep', ['2']); continue }
      }
      return combined
    }
    return stdout || (stderr.includes('Success') ? 'Success' : stderr)
  }
  return 'ERROR: usdcInvoke retries exhausted'
}

export function usdcBalance(addr: string): bigint {
  const out = usdcInvoke('kindlepool-deployer', 'balance', `--id ${addr}`)
  const m = out.match(/\d+/)
  return m ? BigInt(m[0]) : 0n
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Pace CLI invokes to avoid RPC throttling on rapid sequences.
export const pace = () => sleep(700)
