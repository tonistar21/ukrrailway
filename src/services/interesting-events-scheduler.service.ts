import { env } from '../config/env.js'
import { syncInterestingEvents } from './interesting-events.service.js'

async function processInterestingEventsSync() {
  try {
    await syncInterestingEvents()
  } catch (error) {
    console.error('INTERESTING_EVENTS_SYNC_ERROR', error)
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
