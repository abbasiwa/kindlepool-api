import { startEventListener } from './listener'
import { startApi } from './api'
import { getDb } from './db'

export function startIndexer(): void {
  console.log('╔═══════════════════════════════════════════╗')
  console.log('║     KindlePool Indexer + API              ║')
  console.log('╚═══════════════════════════════════════════╝')

  getDb()

  if (process.env.KINDPOOL_CONTRACT_ID) {
    startEventListener()
  } else {
    console.log('No KINDPOOL_CONTRACT_ID set — running in API-only mode (no event listening)')
  }

  startApi()
}

if (require.main === module) {
  startIndexer()
}
