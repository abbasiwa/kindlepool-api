import { connectMongo } from './db/connection'
import logger from './lib/logger'

// Service entrypoints (refactored in Phase 2 to be importable)
import { startIndexer } from '../../services/indexer/src/index'
import { startRelayer } from '../../services/relayer/src/index'
import { startNotifier } from '../../services/notifier/src/index'
import { startMonitor } from '../../services/monitor/src/index'

const ENABLE_RELAYER = process.env.KINDPOOL_ENABLE_RELAYER !== 'false'
const ENABLE_NOTIFIER = process.env.KINDPOOL_ENABLE_NOTIFIER !== 'false'
const ENABLE_MONITOR = process.env.KINDPOOL_ENABLE_MONITOR !== 'false'

async function main() {
  logger.info({ phase: 'startup' }, 'KindlePool unified backend starting')

  // Persistent state (users, subscriptions, api keys, profiles, works).
  await connectMongo()

  // Indexer: REST API (3001) + Soroban event listener. Always on.
  startIndexer()

  // Relayer: gasless tx fee-bump (3002). On unless disabled.
  if (ENABLE_RELAYER) startRelayer()
  else logger.warn('relayer disabled (KINDPOOL_ENABLE_RELAYER=false)')

  // Notifier: email notifications (3003). On unless disabled.
  if (ENABLE_NOTIFIER) startNotifier()
  else logger.warn('notifier disabled (KINDPOOL_ENABLE_NOTIFIER=false)')

  // Monitor: health/anomaly checks (no HTTP). On unless disabled.
  if (ENABLE_MONITOR) startMonitor()
  else logger.warn('monitor disabled (KINDPOOL_ENABLE_MONITOR=false)')

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down')
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal error starting unified backend')
  process.exit(1)
})
