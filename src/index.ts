import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', message: 'ocrx worker running' })
})

export default app
