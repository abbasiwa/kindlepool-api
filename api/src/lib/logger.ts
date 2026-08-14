import pino from 'pino'

const LOG_LEVEL = process.env.KINDPOOL_LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'kindlepool-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
})

export default logger
