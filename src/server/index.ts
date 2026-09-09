import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

app.get('/api/salud', async (c) => {
  const fila = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM products').first<{ total: number }>()
  return c.json({ ok: true, productos: fila?.total ?? 0 })
})

export default app
