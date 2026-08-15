import { connectMongo } from './db/connection'
import logger from './lib/logger'
import { authRouter } from './auth'
import { app as indexerApp } from '../../services/indexer/src/api'

const ENABLE_RELAYER = process.env.KINDPOOL_ENABLE_RELAYER !== 'false'
const ENABLE_NOTIFIER = process.env.KINDPOOL_ENABLE_NOTIFIER !== 'false'
const ENABLE_MONITOR = process.env.KINDPOOL_ENABLE_MONITOR !== 'false'

async function main() {
  logger.info({ phase: 'startup' }, 'KindlePool unified backend starting')

  // Persistent state (users, subscriptions, api keys, profiles, works).
  await connectMongo()

  // Mount auth routes on the public indexer API before it starts listening.
  indexerApp.use('/api/v1/auth', authRouter)

  // Indexer: REST API (3001) + Soroban event listener. Always on.
  const { startIndexer } = await import('../../services/indexer/src/index')
  startIndexer()

  // Relayer / notifier / monitor are lazy-loaded so disabled services never
  // pull their heavy dependencies into memory (keeps the dyno footprint low).
  if (ENABLE_RELAYER) {
    const { startRelayer } = await import('../../services/relayer/src/index')
    startRelayer()
  } else {
    logger.warn('relayer disabled (KINDPOOL_ENABLE_RELAYER=false)')
  }

  if (ENABLE_NOTIFIER) {
    const { startNotifier } = await import('../../services/notifier/src/index')
    startNotifier()
  } else {
    logger.warn('notifier disabled (KINDPOOL_ENABLE_NOTIFIER=false)')
  }

  if (ENABLE_MONITOR) {
    const { startMonitor } = await import('../../services/monitor/src/index')
    startMonitor()
  } else {
    logger.warn('monitor disabled (KINDPOOL_ENABLE_MONITOR=false)')
  }

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
