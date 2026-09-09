/**
 * Almacen y sucursales.
 *
 * Cada ubicacion puede llevar un icono o una foto de la fachada. No es adorno:
 * el selector de ubicacion se usa docenas de veces al dia y reconocer un icono
 * es mas rapido que leer tres nombres parecidos.
 *
 * Desactivar una ubicacion con mercancia dentro esta prohibido en el servidor.
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
import { Marco } from '../componentes/Marco'
import { useAvisos } from '../contexto/Avisos'
import { numero } from '../lib/formato'
import { liberarVista, prepararFoto } from '../lib/imagen'

/** Iconos frecuentes en un negocio de este tipo. */
const ICONOS = ['🏭', '🏬', '🏪', '🏢', '📦', '🛒', '🏠', '🚚'] as const

export function Sucursales() {
  const cliente = useQueryClient()
  const avisos = useAvisos()

  const [editando, setEditando] = useState<Ubicacion | 'nueva' | null>(null)

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
      avisos.exito(ubicacion.activa ? 'Ubicacion desactivada' : 'Ubicacion activada')
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
                      {ubicacion.tipo === 'warehouse' ? 'Almacen' : 'Sucursal'}
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
                      onClick={() => void desactivar(ubicacion)}
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
          Una ubicacion con mercancia dentro no se puede desactivar. Traspasa lo que quede antes,
          o el inventario dejaria de cuadrar sin ningun movimiento que lo explique.
        </p>
      </div>

      <HojaInferior
        abierta={editando !== null}
        onCerrar={() => setEditando(null)}
        titulo={editando === 'nueva' ? 'Nueva ubicacion' : 'Editar ubicacion'}
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
  const [foto, setFoto] = useState<{ archivo: Blob; vista: string } | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

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
      }

      const id =
        ubicacion === null
          ? (await api.crearUbicacion(datos)).ubicacion.id
          : (await api.actualizarUbicacion(ubicacion.id, datos)).ubicacion.id

      if (foto !== null) {
        try {
          await api.subirImagen('ubicacion', id, foto.archivo)
        } catch {
          avisos.error('Se guardo la ubicacion, pero la foto no se pudo subir')
        }
      }

      avisos.exito(ubicacion === null ? 'Ubicacion creada' : 'Ubicacion actualizada')
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
        <Etiqueta>Que es</Etiqueta>
        <div className="flex gap-2">
          {(
            [
              { valor: 'warehouse' as const, texto: 'Almacen' },
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
        etiqueta="Direccion"
        value={direccion}
        onChange={(e) => setDireccion(e.target.value)}
        placeholder="Opcional"
        autoComplete="off"
      />

      <CampoTexto
        etiqueta="Telefono"
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
        <Boton cargando={enviando} onClick={() => void guardar()}>
          Guardar
        </Boton>
      </div>
    </div>
  )
}
