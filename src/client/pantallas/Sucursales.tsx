/**
 * Almacen y sucursales.
 *
 * Cada ubicacion puede llevar un icono o una foto de la fachada. No es adorno:
 * el selector de ubicacion se usa docenas de veces al dia y reconocer un icono
 * es mas rápido que leer tres nombres parecidos.
 *
 * Desactivar una ubicacion con mercancía dentro esta prohibido en el servidor.
 * Aqui se explica antes de intentarlo, para que el rechazo no llegue como un
 * error suelto.
 */

import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Ubicacion } from '@compartido/tipos'
import { ErrorDeApi, api, urlDeImagen } from '../api/cliente'
import { Boton } from '../componentes/Boton'
import { CampoTexto } from '../componentes/Campo'
import { Esqueleto, ErrorEnPantalla, Etiqueta } from '../componentes/Estados'
import { HojaInferior } from '../componentes/HojaInferior'
import { Confirmacion } from '../componentes/Confirmacion'
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { numero } from '../lib/formato'
import { liberarVista, prepararFoto } from '../lib/imagen'

/** Iconos frecuentes en un negocio de este tipo. */
const ICONOS = ['🏭', '🏬', '🏪', '🏢', '📦', '🛒', '🏠', '🚚'] as const
const COLORES = ['#315DB8', '#0D8A62', '#C56B18', '#B13E55', '#7851A9', '#147B8C'] as const

export function Sucursales() {
  const cliente = useQueryClient()
  const avisos = useAvisos()

  const [editando, setEditando] = useState<Ubicacion | 'nueva' | null>(null)
  const [confirmando, setConfirmando] = useState<Ubicacion | null>(null)

  const lista = useQuery({
    queryKey: ['ubicaciones', 'todas'],
    queryFn: () => api.ubicaciones(true),
  })

  const valor = useQuery({ queryKey: ['valor'], queryFn: api.valorInventario })

  const piezasEn = (id: string): number =>
    valor.data?.ubicaciones.find((u) => u.ubicacionId === id)?.piezas ?? 0

  const desactivar = async (ubicacion: Ubicacion): Promise<void> => {
    try {
      await api.actualizarUbicacion(ubicacion.id, { activa: !ubicacion.activa })
      avisos.exito(ubicacion.activa ? 'Ubicación desactivada' : 'Ubicación activada')
      void cliente.invalidateQueries({ queryKey: ['ubicaciones'] })
    } catch (causa) {
      avisos.error(causa instanceof ErrorDeApi ? causa.message : 'No se pudo cambiar')
    }
  }

  return (
    <Marco
      titulo="Sucursales"
      atras
      sinUbicacion
      accion={
        <button
          type="button"
          onClick={() => setEditando('nueva')}
          className="flex min-h-11 shrink-0 items-center rounded-xl bg-accion px-3.5 text-[0.875rem] font-semibold text-white transition active:bg-accion-viva"
        >
          Agregar
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {lista.isPending && <Esqueleto filas={4} />}

        {lista.isError && (
          <ErrorEnPantalla
            mensaje="No se pudieron cargar las ubicaciones."
            onReintentar={() => void lista.refetch()}
          />
        )}

        {lista.isSuccess && (
          <ul className="flex flex-col gap-2">
            {lista.data.ubicaciones.map((ubicacion) => {
              const foto = urlDeImagen(ubicacion.claveImagen)
              const piezas = piezasEn(ubicacion.id)

              return (
                <li
                  key={ubicacion.id}
                  className={[
                    'flex items-center gap-3 rounded-tarjeta border bg-superficie p-3',
                    ubicacion.activa ? 'border-borde' : 'border-borde opacity-60',
                  ].join(' ')}
                >
                  {foto === null ? (
                    <span
                      aria-hidden="true"
                      className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-papel-hundido text-2xl"
                    >
                      {ubicacion.icono ?? (ubicacion.tipo === 'warehouse' ? '🏭' : '🏬')}
                    </span>
                  ) : (
                    <img
                      src={foto}
                      alt=""
                      width={56}
                      height={56}
                      className="size-14 shrink-0 rounded-xl bg-papel-hundido object-cover"
                    />
                  )}

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-[1rem] font-semibold">{ubicacion.nombre}</p>
                    <p className="text-[0.8125rem] text-tinta-tenue">
                      {ubicacion.tipo === 'warehouse' ? 'Almacén' : 'Sucursal'}
                      {!ubicacion.activa && ' · desactivada'}
                    </p>
                    <p className="cifras text-[0.8125rem] text-tinta-suave">
                      {numero(piezas)} piezas
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(ubicacion)}
                      className="rounded-lg px-2.5 py-1.5 text-[0.875rem] font-semibold text-accion transition active:bg-accion-tenue"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmando(ubicacion)}
                      className="rounded-lg px-2.5 py-1.5 text-[0.875rem] font-medium text-tinta-tenue transition active:bg-papel-hundido"
                    >
                      {ubicacion.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <p className="rounded-xl bg-papel-hundido px-4 py-3 text-[0.8125rem] leading-relaxed text-tinta-tenue">
          Una ubicacion con mercancía dentro no se puede desactivar. Traspasa lo que quede antes,
          o el inventario dejaría de cuadrar sin ningun movimiento que lo explique.
        </p>
      </div>

      <HojaInferior
        abierta={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nueva' ? 'Nueva ubicación' : 'Editar ubicación'}
      >
        {editando !== null && (
          <FormularioUbicacion
            ubicacion={editando === 'nueva' ? null : editando}
            onListo={() => {
              setEditando(null)
              void cliente.invalidateQueries({ queryKey: ['ubicaciones'] })
              void cliente.invalidateQueries({ queryKey: ['valor'] })
            }}
            onCancelar={() => setEditando(null)}
          />
        )}
      </HojaInferior>
      <Confirmacion abierta={confirmando !== null} titulo={`${confirmando?.activa ? '¿Desactivar' : '¿Activar'} ${confirmando?.nombre ?? 'ubicación'}?`} detalle={confirmando?.activa ? `Confirma el cambio de ${confirmando.nombre}. Si todavía tiene equipos o productos, la app te indicará qué mover antes.` : `Confirma que quieres volver a activar ${confirmando?.nombre ?? 'esta ubicación'}.`} confirmar={confirmando?.activa ? 'Desactivar' : 'Activar'} peligro={confirmando?.activa} onCancelar={() => setConfirmando(null)} onConfirmar={() => { if (confirmando !== null) void desactivar(confirmando); setConfirmando(null) }} />
    </Marco>
  )
}

function FormularioUbicacion({
  ubicacion,
  onListo,
  onCancelar,
}: {
  ubicacion: Ubicacion | null
  onListo: () => void
  onCancelar: () => void
}) {
  const avisos = useAvisos()

  const [nombre, setNombre] = useState(ubicacion?.nombre ?? '')
  const [tipo, setTipo] = useState<'warehouse' | 'store'>(ubicacion?.tipo ?? 'store')
  const [icono, setIcono] = useState<string>(ubicacion?.icono ?? '🏬')
  const [direccion, setDireccion] = useState(ubicacion?.direccion ?? '')
  const [telefono, setTelefono] = useState(ubicacion?.telefono ?? '')
  const [color, setColor] = useState(ubicacion?.color ?? '#315DB8')
  const [foto, setFoto] = useState<{ archivo: Blob; vista: string } | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  const refArchivo = useRef<HTMLInputElement | null>(null)
  const fotoActual = urlDeImagen(ubicacion?.claveImagen ?? null)

  const elegirFoto = async (archivo: File): Promise<void> => {
    try {
      const lista = await prepararFoto(archivo)
      setFoto((anterior) => {
        if (anterior !== null) liberarVista(anterior.vista)
        return lista
      })
    } catch {
      avisos.error('No se pudo procesar esa foto')
    }
  }

  const guardar = async (): Promise<void> => {
    if (nombre.trim().length === 0) {
      setCampos({ nombre: 'Ponle un nombre' })
      return
    }

    setEnviando(true)
    setCampos({})

    try {
      const datos = {
        nombre: nombre.trim(),
        tipo,
        icono,
        direccion: direccion.trim() === '' ? null : direccion.trim(),
        telefono: telefono.trim() === '' ? null : telefono.trim(),
        color,
      }

      const id =
        ubicacion === null
          ? (await api.crearUbicacion(datos)).ubicacion.id
          : (await api.actualizarUbicacion(ubicacion.id, datos)).ubicacion.id

      if (foto !== null) {
        try {
          await api.subirImagen('ubicacion', id, foto.archivo)
        } catch {
          avisos.error('Se guardó la ubicación, pero la foto no se pudo subir')
        }
      }

      avisos.exito(ubicacion === null ? 'Ubicación creada' : 'Ubicación actualizada')
      onListo()
    } catch (causa) {
      if (causa instanceof ErrorDeApi) {
        setCampos(causa.campos ?? {})
        avisos.error(causa.message)
      } else {
        avisos.error('No se pudo guardar')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="flex flex-col gap-2">
        <Etiqueta>Qué es</Etiqueta>
        <div className="flex gap-2">
          {(
            [
              { valor: 'warehouse' as const, texto: 'Almacén' },
              { valor: 'store' as const, texto: 'Sucursal' },
            ]
          ).map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              onClick={() => setTipo(opcion.valor)}
              className={[
                'min-h-toque flex-1 rounded-xl border text-[1rem] font-semibold transition',
                tipo === opcion.valor
                  ? 'border-accion bg-accion-tenue text-accion-viva'
                  : 'border-borde bg-superficie text-tinta-suave',
              ].join(' ')}
            >
              {opcion.texto}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Etiqueta>Color identificador</Etiqueta>
        <div className="flex flex-wrap gap-2">{COLORES.map((opcion) => <button key={opcion} type="button" aria-label={`Color ${opcion}`} aria-pressed={color === opcion} onClick={() => setColor(opcion)} className={`flex size-11 items-center justify-center rounded-xl border-2 ${color === opcion ? 'border-tinta scale-105' : 'border-transparent'}`} style={{ backgroundColor: opcion }}><span className="text-white">{color === opcion ? '✓' : ''}</span></button>)}</div>
      </div>

      <CampoTexto
        etiqueta="Nombre"
        value={nombre}
        error={campos.nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Sucursal Centro"
        autoComplete="off"
        autoFocus
      />

      <div className="flex flex-col gap-2">
        <Etiqueta>Icono</Etiqueta>
        <div className="flex flex-wrap gap-2">
          {ICONOS.map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-label={`Icono ${opcion}`}
              onClick={() => setIcono(opcion)}
              className={[
                'flex size-12 items-center justify-center rounded-xl border text-2xl transition',
                icono === opcion
                  ? 'border-accion bg-accion-tenue'
                  : 'border-borde bg-superficie active:bg-papel-hundido',
              ].join(' ')}
            >
              {opcion}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => refArchivo.current?.click()}
          className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-borde-fuerte bg-superficie text-tinta-tenue transition active:bg-papel-hundido"
        >
          {foto !== null ? (
            <img src={foto.vista} alt="" className="size-full object-cover" />
          ) : fotoActual !== null ? (
            <img src={fotoActual} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xl">＋</span>
          )}
        </button>

        <div className="flex flex-col gap-0.5">
          <p className="text-[0.9375rem] font-medium">Foto de la fachada</p>
          <p className="text-[0.8125rem] text-tinta-tenue">Opcional.</p>
        </div>

        <input
          ref={refArchivo}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo !== undefined) void elegirFoto(archivo)
            e.target.value = ''
          }}
        />
      </div>

      <CampoTexto
        etiqueta="Dirección"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        placeholder="Opcional"
        autoComplete="off"
      />

      <CampoTexto
        etiqueta="Teléfono"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        inputMode="tel"
        placeholder="Opcional"
        autoComplete="off"
      />

      <div className="grid grid-cols-[1fr_2fr] gap-2.5 pt-1">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton cargando={enviando} onClick={() => setConfirmando(true)}>
          Guardar
        </Boton>
      </div>
      <Confirmacion abierta={confirmando} titulo={`${ubicacion === null ? '¿Crear' : '¿Guardar cambios de'} ${nombre.trim() || 'esta ubicación'}?`} detalle={ubicacion === null ? `Se creará ${nombre.trim() || 'la nueva ubicación'} con los datos elegidos.` : `Confirma los cambios para ${nombre.trim() || ubicacion.nombre}.`} confirmar={ubicacion === null ? 'Crear ubicación' : 'Guardar cambios'} onCancelar={() => setConfirmando(false)} onConfirmar={() => { setConfirmando(false); void guardar() }} />
    </div>
  )
}
