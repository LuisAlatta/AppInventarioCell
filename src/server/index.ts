/**
 * Punto de entrada del Worker.
 *
 * Un solo Worker sirve la API y los archivos de la aplicacion. La
 * configuracion de `wrangler.jsonc` manda a este codigo todo lo que empieza
 * por `/api/`, y deja el resto en manos de los assets estaticos con vuelta a
 * `index.html` para las rutas del cliente.
 */

import { Hono } from 'hono'
import { ZodError } from 'zod'
import { ErrorApp, comoErrorApp, cuerpoDeError } from './lib/errores'
import { exigirSesion } from './middleware/autenticacion'
import { rutasAcceso } from './routes/acceso'
import { rutasCatalogo } from './routes/catalogo'
import { rutasConteos } from './routes/conteos'
import { rutasImagenes } from './routes/imagenes'
import { rutasMovimientos } from './routes/movimientos'
import { rutasEquipos } from './routes/equipos'
import type { Variables } from './tipos_hono'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Un unico traductor de errores para toda la API.
 *
 * Con esto ninguna ruta necesita su propio try/catch, y ningun fallo puede
 * escaparse como un 500 sin cuerpo. Lo que el cliente recibe siempre tiene la
 * misma forma, y el detalle tecnico queda en el registro del servidor.
 */
app.onError((error, c) => {
  if (error instanceof ZodError) {
    const campos: Record<string, string> = {}
    for (const problema of error.issues) {
      const campo = problema.path.join('.') || 'general'
      campos[campo] ??= problema.message
    }

    const app = new ErrorApp('datos_invalidos', 'Revisa los datos', { campos })
    return c.json(cuerpoDeError(app), 400)
  }

  const traducido = comoErrorApp(error)

  if (traducido.estado >= 500) {
    console.error('fallo no previsto', {
      ruta: c.req.path,
      metodo: c.req.method,
      mensaje: traducido.message,
      causa: traducido.cause instanceof Error ? traducido.cause.message : String(traducido.cause),
    })
  }

  return c.json(cuerpoDeError(traducido), traducido.estado as 400)
})

app.notFound((c) => {
  const error = new ErrorApp('no_encontrado', 'Esa dirección no existe')
  return c.json(cuerpoDeError(error), 404)
})

// ---------------------------------------------------------------------------
// Rutas publicas: solo las imprescindibles para poder entrar
// ---------------------------------------------------------------------------

const publicas = new Hono<{ Bindings: Env; Variables: Variables }>()

/** Sirve para comprobar que el Worker y la base responden. */
publicas.get('/salud', async (c) => {
  await c.env.DB.prepare('SELECT 1').first()
  return c.json({ ok: true })
})

publicas.route('/acceso', rutasAcceso)

// ---------------------------------------------------------------------------
// Rutas protegidas
// ---------------------------------------------------------------------------

/**
 * Grupo que exige sesion.
 *
 * El middleware se registra como **primera** linea del grupo, antes de montar
 * cualquier ruta dentro. Es lo que garantiza que un endpoint nuevo quede
 * protegido por el simple hecho de vivir aqui.
 *
 * La alternativa, un `app.use('/api/*')` en el nivel de arriba, depende del
 * orden de registro: una ruta declarada antes de esa linea queda publica sin
 * que nada avise. Con un grupo, para dejar algo abierto hay que sacarlo de
 * aqui a proposito.
 */
const protegidas = new Hono<{ Bindings: Env; Variables: Variables }>()

protegidas.use('*', exigirSesion)

protegidas.route('/', rutasCatalogo)
protegidas.route('/movimientos', rutasMovimientos)
protegidas.route('/equipos', rutasEquipos)
protegidas.route('/conteos', rutasConteos)
protegidas.route('/imagenes', rutasImagenes)

// Las publicas se montan primero: para una peticion a `/api/acceso` responde
// ese manejador y la peticion nunca llega al grupo protegido.
app.route('/api', publicas)
app.route('/api', protegidas)

export default app
