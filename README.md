# Inventario

**En producción: https://inventario.luisalatta.workers.dev**

Aplicación web instalable para controlar el inventario de un almacén y sus sucursales,
escaneando códigos de barras. Detecta mermas comparando lo que debería haber contra lo que
realmente hay, sucursal por sucursal.

La especificación completa está en [docs/especificacion.md](docs/especificacion.md).

## Qué hace

- **Escanea** códigos de barras de fábrica (EAN/UPC) con la cámara del teléfono.
- **Registra** entradas, ventas, traspasos, mermas y correcciones, cada una con su historial.
- **Cuenta** el inventario físico y compara con el sistema.
- **Detecta faltantes** por sucursal, en piezas y en dinero, con ranking de dónde se pierde más.
- **Busca** tolerando errores de escritura: "samsng" encuentra Samsung.
- **Deshace** cualquier movimiento sin borrar el historial.

## Stack

| Pieza | Elección | Por qué |
|---|---|---|
| Interfaz | React + Vite + Tailwind, como PWA | Instalable en el iPhone desde Safari |
| Escáner | `zxing-wasm` | Safari no trae `BarcodeDetector` |
| API | Cloudflare Workers + Hono + Zod | Sin servidores, dentro de la capa gratuita |
| Base de datos | Cloudflare D1 (SQLite) con FTS5 | Búsqueda instantánea sin servicios extra |
| Fotos | Cloudflare KV | Redimensionadas en el teléfono; KV porque el OAuth de wrangler no da acceso a R2 |

Un solo Worker sirve la aplicación y la API, así que no hay CORS ni dos dominios.

## Poner a andar el proyecto en local

```bash
npm install
```

Genera el secreto de firma para desarrollo:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('base64url'))" > .dev.vars
```

Crea el esquema en la base de datos local:

```bash
npm run db:migrar:local
```

Arranca todo con un solo comando. El Worker corre en `workerd` real, con la D1 local:

```bash
npm run dev
```

Abre `http://localhost:5173`. La primera pantalla pide elegir un PIN de seis dígitos.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Aplicación y API en local, con recarga en caliente |
| `npm run build` | Compila para producción |
| `npm run typecheck` | Revisa los tipos de cliente y servidor |
| `npm test` | Pruebas unitarias y de API (124 pruebas) |
| `npm run db:migrar:local` | Aplica las migraciones a la base local |
| `npm run db:sembrar:local` | Carga datos de ejemplo para probar sin capturar nada |
| `npm run db:migrar` | Aplica las migraciones a la base en la nube |
| `npm run tipos` | Regenera los tipos de los enlaces de Cloudflare |

## Desplegar a Cloudflare

Este proyecto va a la cuenta **newluisalattago@gmail.com**.

Las credenciales se guardan **en el proyecto**, con un token de API, y no en la sesión global de
`wrangler login`. Es a propósito: la sesión global es una sola para toda la máquina y suele
quedar en la del proyecto anterior, que es la forma más fácil de desplegar en la cuenta de otro
cliente sin darse cuenta. Con el token en el proyecto, eso no puede pasar.

Copia `.env.example` como `.env` y rellena los dos valores. Ahí están los permisos exactos que
hace falta darle al token. El archivo está en `.gitignore`.

Comprueba que quedó bien:

```bash
npx wrangler whoami
```

Debe mostrar `newluisalattago@gmail.com`. Si muestra otra cuenta, el token o el id de cuenta del
`.env` no corresponden.

### Si prefieres el login interactivo

Funciona igual (`npx wrangler logout` y luego `npx wrangler login`), pero con dos advertencias.
La sesión es global para toda la máquina, así que hay que verificar `whoami` antes de cada
despliegue. Y **no conviene reintentarlo en ráfaga**: cada intento invalida el CSRF del anterior,
y a partir de una docena de intentos seguidos el WAF de Cloudflare bloquea la IP en el endpoint
de OAuth y devuelve "Sorry, you have been blocked". Ese bloqueo se levanta solo al cabo de un
rato; el token de API no se ve afectado porque va por otro endpoint.

### Los recursos ya están creados

La base D1, el espacio KV, el subdominio `luisalatta.workers.dev` y el secreto `SESSION_SECRET`
están creados y anotados en `wrangler.jsonc`. No hay que volver a crearlos.

**El `SESSION_SECRET` no se debe cambiar.** Con él se firman las sesiones y se protege el PIN, y
no se puede leer de vuelta: si se rota, la dueña queda fuera de su propia app. La recuperación
sería borrar la fila de `users` en la base y volver a configurar el PIN desde la primera pantalla:

```bash
npx wrangler d1 execute inventario --remote --command "DELETE FROM users"
```

### Publicar cambios

```bash
npm run deploy
```

Compila y despliega usando la configuración que genera el build en `dist/inventario/`, que es la
que trae resueltas las rutas de los archivos estáticos.

### Ojo con los datos de ejemplo

`datos/datos_iniciales.sql` vive **fuera** de `migrations/` a propósito. Todo `.sql` que esté en
`migrations/` lo aplica `wrangler d1 migrations apply`, incluido el remoto: teniéndolo ahí, los
datos de demostración acabaron una vez en la base de producción. Solo se carga a mano y solo en
local, con `npm run db:sembrar:local`.

## Instalar en el iPhone

1. Abre la dirección de la app en **Safari** (no en Chrome: en iOS solo Safari puede instalar).
2. Toca el botón de compartir y elige **Añadir a pantalla de inicio**.
3. Ábrela desde el icono, no desde Safari. Instalada tiene la pantalla completa y la cámara
   funciona sin la barra del navegador estorbando.

La primera vez que se escanea, iOS pide permiso de cámara. Si se rechaza por error, se habilita
en Ajustes → Safari → Cámara.

## Estructura

```
src/
├── shared/      Tipos y esquemas de validación que usan cliente y servidor
├── server/
│   ├── db/        Única capa que escribe SQL
│   ├── services/  Reglas de negocio: stock, conteos, mermas, búsqueda
│   ├── routes/    Endpoints HTTP con validación
│   ├── lib/       Sesión, errores, identificadores
│   └── index.ts   Armado del Worker
└── client/
    ├── api/         Cliente tipado de la API
    ├── componentes/ Piezas reutilizadas entre pantallas
    ├── contexto/    Ubicación activa y avisos
    ├── escaner/     Cámara y decodificación, aislados del resto
    ├── pantallas/   Una por pantalla de la app
    └── lib/         Formato, imágenes, vibración y sonido
```

## Decisiones que conviene conocer antes de tocar el código

- **El stock nunca se edita a mano.** Se deriva de los movimientos, y cada movimiento se escribe
  junto con su cambio de stock en la misma transacción. Ver
  [src/server/services/inventario.ts](src/server/services/inventario.ts).
- **Un movimiento no se borra.** Deshacer crea el movimiento contrario y marca el original como
  revertido. El historial es la evidencia del reporte de mermas.
- **El upsert de stock son dos sentencias, no una.** SQLite valida los `CHECK` sobre la fila
  candidata del `INSERT` antes de resolver el `ON CONFLICT`, así que un delta negativo rompe la
  restricción aunque el resultado final sea válido. Explicado en
  [src/server/db/stock.ts](src/server/db/stock.ts).
- **Los trigramas no toleran errores por sí solos.** El tokenizador `trigram` de SQLite hace
  coincidencia de subcadena, no distancia de edición. La tolerancia se logra partiendo la consulta
  en trigramas y puntuando cuántos coinciden. Ver
  [src/server/services/trigramas.ts](src/server/services/trigramas.ts).
- **El PIN se protege con HMAC y un secreto del servidor, no con PBKDF2 de muchas iteraciones.**
  El plan gratuito de Workers da 10 ms de CPU por petición. El razonamiento completo está en
  [src/server/lib/sesion.ts](src/server/lib/sesion.ts).

## Nota sobre `npm install`

El proyecto fija `legacy-peer-deps=true` en `.npmrc`. No es por un conflicto real de versiones:
npm 11.1.0 tiene un fallo en su resolutor de dependencias que lo hace caer al recorrer las
dependencias opcionales de Vitest. La matriz de versiones se verificó a mano y es compatible.
Con npm 12 o superior la bandera se puede quitar.
#   A p p I n v e n t a r i o C e l l  
 