import express from 'express'

export function createHttpServer() {
  const app = express()

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true
    })
  })

  return app
}
