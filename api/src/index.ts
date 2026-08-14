import { connectMongo } from './db/connection'

// Service entrypoints (refactored in Phase 2 to be importable)
import { startIndexer } from '../../services/indexer/src/index'
import { startRelayer } from '../../services/relayer/src/index'
import { startNotifier } from '../../services/notifier/src/index'
import { startMonitor } from '../../services/monitor/src/index'

const ENABLE_RELAYER = process.env.KINDPOOL_ENABLE_RELAYER !== 'false'
const ENABLE_NOTIFIER = process.env.KINDPOOL_ENABLE_NOTIFIER !== 'false'
const ENABLE_MONITOR = process.env.KINDPOOL_ENABLE_MONITOR !== 'false'

async function main() {
  console.log('╔═══════════════════════════════════════════════╗')
  console.log('║    KindlePool Unified Backend                  ║')
  console.log('╚═══════════════════════════════════════════════╝')

  // Persistent state (users, subscriptions, api keys, profiles, works).
  await connectMongo()

  // Indexer: REST API (3001) + Soroban event listener. Always on.
  startIndexer()

  // Relayer: gasless tx fee-bump (3002). On unless disabled.
  if (ENABLE_RELAYER) startRelayer()

  // Notifier: email notifications (3003). On unless disabled.
  if (ENABLE_NOTIFIER) startNotifier()

  // Monitor: health/anomaly checks (no HTTP). On unless disabled.
  if (ENABLE_MONITOR) startMonitor()

  const shutdown = () => {
    console.log('\nShutting down…')
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Fatal error starting unified backend:', err)
  process.exit(1)
})
