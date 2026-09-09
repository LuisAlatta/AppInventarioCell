# Inventario

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
| `npm run db:migrar` | Aplica las migraciones a la base en la nube |
| `npm run tipos` | Regenera los tipos de los enlaces de Cloudflare |

## Desplegar a Cloudflare

Este proyecto va a la cuenta **newluisalattago@gmail.com**. Verifica siempre antes de tocar la
nube, porque la sesión de `wrangler` es global y suele quedar en la del proyecto anterior:

```bash
npx wrangler whoami
```

Si no es la cuenta correcta, cierra e inicia sesión (abre primero el panel de la cuenta correcta
en el navegador, o usa una ventana privada):

```bash
npx wrangler logout
```

```bash
npx wrangler login
```

### Crear los recursos, una sola vez

```bash
npx wrangler d1 create inventario
```

Copia el `database_id` que imprime y ponlo en `wrangler.jsonc`, en lugar de `PENDIENTE`.

Crea el espacio KV donde viven las fotos. Copia el `id` que imprime y ponlo en `wrangler.jsonc`,
en el bloque `kv_namespaces`:

```bash
npx wrangler kv namespace create FOTOS
```

Genera y guarda el secreto de producción. No va en ningún archivo:

```bash
npx wrangler secret put SESSION_SECRET
```

Aplica el esquema a la base de la nube:

```bash
npm run db:migrar
```

### Publicar

```bash
npm run deploy
```

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
