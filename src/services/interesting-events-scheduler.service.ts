import { env } from '../config/env.js'
import { syncInterestingEvents } from './interesting-events.service.js'

async function processInterestingEventsSync() {
  try {
    await syncInterestingEvents()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`INTERESTING_EVENTS_SYNC_SKIPPED: ${message}`)
  }
}

export function startInterestingEventsScheduler() {
  const intervalMs = env.INTERESTING_EVENTS_SYNC_MINUTES * 60_000
  const run = () => {
    void processInterestingEventsSync()
  }

  run()
  const timer = setInterval(run, intervalMs)

  return () => {
    clearInterval(timer)
  }
}
