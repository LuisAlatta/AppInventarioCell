# Cloudflare por proyecto

## AppInventarioCell

- Cuenta autorizada: `0acfa25b5f619f94d581b8cf882e2eec`.
- Correo esperado al verificar acceso: `newluisalattago@gmail.com`.
- Worker: `inventario`.
- URL pública: `https://inventario.luisalatta.workers.dev`.
- Despliegue: `npm run deploy`.
- Base D1: no ejecutar migraciones al publicar cambios que no incluyan una migración nueva.

## Regla de credenciales

- Cada proyecto usa un token de Cloudflare distinto y limitado exclusivamente a su cuenta.
- Antes de publicar, ejecutar `npx wrangler whoami` y comprobar cuenta y correo.
- Para este proyecto, usar un token con permiso `Edit Cloudflare Workers`, restringido a la cuenta autorizada.
- Los tokens no se guardan en Git, archivos del proyecto, documentación, chats ni variables persistentes compartidas.
- El token se carga solo en la terminal de trabajo mediante `CLOUDFLARE_API_TOKEN` y se elimina al terminar.
- Al cambiar de proyecto o cuenta, retirar el token de la sesión y cargar el token específico del nuevo proyecto.

## Verificación de sesión

```powershell
npx wrangler whoami
```

La publicación se detiene si la cuenta no coincide con este documento.
