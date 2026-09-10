/**
 * Alta de producto.
 *
 * Se abre cuando se escanea un codigo que no esta en el catálogo, con el codigo
 * ya cargado. Ese es el flujo natural: el catálogo no se construye de golpe
 * sino escaneando lo que va apareciendo.
 *
 * Solo el nombre es obligatorio. Pedir precios, categoria y minimo de entrada
 * convertiria dar de alta un producto en un trámite, y a mitad del primer
 * inventario se abandonaria la app. Todo lo demas se completa después.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, PackageCheck, Plus, ScanLine, Trash2 } from 'lucide-react'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { useAvisos } from '../contexto/Avisos'
import { liberarVista, prepararFoto } from '../lib/imagen'
import { useUbicacion } from '../contexto/Ubicacion'

export type CampoEscaneable = 'codigo' | `imei1:${string}` | `imei2:${string}`

interface DatosEquipoNuevo {
  id: string
  imei1: string
  imei2: string
  listaBlanca: 'registered' | 'not_registered'
  condicion: 'new' | 'used'
}

function equipoVacio(): DatosEquipoNuevo {
  return {
    id: crypto.randomUUID(),
    imei1: '',
    imei2: '',
    listaBlanca: 'not_registered',
    condicion: 'new',
  }
}

interface FormularioProductoProps {
  codigoInicial?: string
  onEscanear?: (campo: CampoEscaneable) => void
  lectura?: { campo: CampoEscaneable; valor: string } | null
  onCreado: (producto: ProductoConStock) => void
  onCancelar: () => void
}

export function FormularioProducto({ codigoInicial = '', onEscanear, lectura = null, onCreado, onCancelar }: FormularioProductoProps) {
  const avisos = useAvisos()
  const { activa } = useUbicacion()

  const [codigo, setCodigo] = useState(codigoInicial)
  const [productoExistente, setProductoExistente] = useState<ProductoConStock | null>(null)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [equipos, setEquipos] = useState<DatosEquipoNuevo[]>([equipoVacio()])
  const [precioVenta, setPrecioVenta] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [foto, setFoto] = useState<{ archivo: Blob; vista: string } | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const refArchivo = useRef<HTMLInputElement | null>(null)
  const marcas = useQuery({ queryKey: ['marcas'], queryFn: api.marcas })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categorias })
  const modelosExistentes = useQuery({ queryKey: ['modelos-existentes'], queryFn: () => api.buscar('') })

  useEffect(() => {
    if (lectura === null) return
    if (lectura.campo === 'codigo') setCodigo(lectura.valor)
    if (lectura.campo !== 'codigo') {
      const [campo, id] = lectura.campo.split(':') as ['imei1' | 'imei2', string]
      setEquipos((anteriores) => anteriores.map((equipo) => equipo.id === id ? { ...equipo, [campo]: lectura.valor.replace(/\D/g, '') } : equipo))
    }
  }, [lectura])

  useEffect(() => {
    const codigoLimpio = codigo.trim()
    if (codigoLimpio.length < 4) {
      setProductoExistente(null)
      return undefined
    }

    setProductoExistente((actual) => actual?.codigo === codigoLimpio ? actual : null)
    let vigente = true
    const temporizador = window.setTimeout(() => {
      void api.porCodigo(codigoLimpio)
        .then(({ producto }) => { if (vigente) setProductoExistente(producto) })
        .catch((causa: unknown) => {
          if (vigente && causa instanceof ErrorDeApi && causa.estado === 404) setProductoExistente(null)
        })
    }, 250)
    return () => { vigente = false; window.clearTimeout(temporizador) }
  }, [codigo])

  const actualizarEquipo = (id: string, cambio: Partial<DatosEquipoNuevo>): void => {
    setEquipos((anteriores) => anteriores.map((equipo) => equipo.id === id ? { ...equipo, ...cambio } : equipo))
  }

  // Las URL de vista previa hay que liberarlas o se acumulan en memoria
  // durante una sesion de altas.
  useEffect(() => {
    return () => {
      if (foto !== null) liberarVista(foto.vista)
    }
  }, [foto])

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

  const aNumero = (texto: string): number => {
    const valor = Number(texto.replace(',', '.'))
    return Number.isFinite(valor) && valor >= 0 ? valor : 0
  }

  const guardar = async (): Promise<void> => {
    if (codigo.trim().length < 4) {
      setCampos({ codigo: 'Ingresa o escanea un código válido' })
      return
    }

    const equiposConImei = equipos.filter((equipo) => equipo.imei1.trim() !== '' || equipo.imei2.trim() !== '')
    if (productoExistente !== null && equiposConImei.length === 0) {
      setCampos({ equipos: 'Agrega al menos un IMEI para registrar equipos en este modelo' })
      return
    }

    if (productoExistente === null && nombre.trim().length === 0) {
      setCampos({ nombre: 'Ponle un nombre al producto' })
      return
    }

    setEnviando(true)
    setCampos({})

    try {
      const producto = productoExistente ?? (await api.crearProducto({
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        marca: marca.trim() === '' ? null : marca.trim(),
        modelo: modelo.trim() === '' ? null : modelo.trim(),
        categoriaId: categoriaId === '' ? null : categoriaId,
        precioVenta: aNumero(precioVenta),
        precioCosto: aNumero(precioCosto),
      })).producto

      const hayImei = equiposConImei.length > 0
      if (hayImei && activa !== null) {
        await api.registrarEquipos({
          productoId: producto.id,
          ubicacionId: activa.id,
          equipos: equiposConImei.map((equipo) => ({
            imei1: equipo.imei1.trim() === '' ? null : equipo.imei1.trim(),
            imei2: equipo.imei2.trim() === '' ? null : equipo.imei2.trim(),
            listaBlanca: equipo.listaBlanca,
            condicion: equipo.condicion,
          })),
        })
      }

      // La foto se sube después de crear el producto porque necesita su id.
      // Si falla, el producto ya quedó guardado: se avisa pero no se pierde
      // el alta, que es lo que costo trabajo.
      let conFoto = producto
      if (foto !== null && productoExistente === null) {
        try {
          const { claveImagen } = await api.subirImagen('producto', producto.id, foto.archivo)
          conFoto = { ...producto, claveImagen }
        } catch {
          avisos.error('El producto se guardó, pero la foto no se pudo subir')
        }
      }

      onCreado(conFoto)
      if (hayImei && activa === null) {
        avisos.información(`${productoExistente === null ? 'Producto creado' : producto.nombre}. Elige una ubicación para registrar sus IMEI.`)
      }
    } catch (causa) {
      if (causa instanceof ErrorDeApi) {
        setCampos(causa.campos ?? {})
        avisos.error(causa.message)
      } else {
        avisos.error('No se pudo guardar el producto')
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      <CampoConEscaner
        etiqueta="Código de barras"
        value={codigo}
        error={campos.codigo}
        onChange={setCodigo}
        onEscanear={onEscanear === undefined ? undefined : () => onEscanear('codigo')}
        inputMode="text"
        autoComplete="off"
        placeholder="Escanea o escribe el código"
        ayuda="El escaneo completa este campo automáticamente."
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-tinta-suave">O agrega equipos a un modelo existente</span>
        <select
          value={productoExistente?.id ?? ''}
          onChange={(evento) => {
            const producto = (modelosExistentes.data?.productos ?? []).find((actual) => actual.id === evento.target.value)
            if (producto === undefined) {
              setProductoExistente(null)
              setCodigo('')
              return
            }
            setProductoExistente(producto)
            setCodigo(producto.codigo)
          }}
          className="min-h-toque rounded-xl border border-borde bg-superficie px-3 text-[1rem] text-tinta focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15"
        >
          <option value="">Selecciona un modelo registrado</option>
          {(modelosExistentes.data?.productos ?? []).map((producto) => <option key={producto.id} value={producto.id}>{[producto.nombre, producto.marca, producto.modelo].filter(Boolean).join(' · ')}</option>)}
        </select>
        <span className="text-[0.75rem] text-tinta-tenue">Seleccionarlo evita crear un producto duplicado.</span>
      </label>

      {productoExistente !== null && <section className="flex items-center gap-3 rounded-2xl border border-exito/30 bg-exito-tenue p-3.5"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-exito text-white"><PackageCheck aria-hidden="true" className="size-5" strokeWidth={2} /></span><div className="min-w-0"><p className="text-[0.875rem] font-semibold">Modelo encontrado: {productoExistente.nombre}</p><p className="truncate text-[0.75rem] text-tinta-suave">{[productoExistente.marca, productoExistente.modelo].filter(Boolean).join(' · ') || 'Agregarás equipos a este modelo existente.'}</p></div></section>}

      <section className="flex flex-col gap-3 rounded-2xl border border-accion/25 bg-accion-tenue p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
          <p className="font-semibold">Datos del equipo</p>
          <p className="text-[0.8125rem] text-tinta-suave">Cada IMEI es una unidad individual en {activa?.nombre ?? 'la ubicación que elijas después'}.</p>
          </div>
          <span className="cifras rounded-lg bg-superficie px-2 py-1 text-[0.75rem] font-semibold text-accion">{equipos.length}/50</span>
        </div>
        {campos.equipos !== undefined && <p className="text-[0.75rem] font-medium text-falta">{campos.equipos}</p>}
        {equipos.map((equipo, indice) => <fieldset key={equipo.id} className="flex flex-col gap-3 rounded-xl border border-accion/20 bg-superficie p-3"><div className="flex items-center justify-between gap-2"><legend className="text-[0.8125rem] font-semibold text-tinta">Equipo {indice + 1}</legend>{equipos.length > 1 && <button type="button" onClick={() => setEquipos((anteriores) => anteriores.filter((actual) => actual.id !== equipo.id))} aria-label={`Quitar equipo ${indice + 1}`} className="flex size-9 items-center justify-center rounded-lg text-falta active:bg-falta-tenue"><Trash2 aria-hidden="true" className="size-4" strokeWidth={2} /></button>}</div><div className="grid grid-cols-2 gap-2.5"><CampoConEscaner etiqueta="IMEI 1" value={equipo.imei1} onChange={(valor) => actualizarEquipo(equipo.id, { imei1: valor.replace(/\D/g, '') })} onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei1:${equipo.id}`)} inputMode="numeric" placeholder="Opcional" /><CampoConEscaner etiqueta="IMEI 2" value={equipo.imei2} onChange={(valor) => actualizarEquipo(equipo.id, { imei2: valor.replace(/\D/g, '') })} onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei2:${equipo.id}`)} inputMode="numeric" placeholder="Opcional" /></div><div className="grid grid-cols-2 gap-3"><GrupoChecks etiqueta="Lista blanca" valor={equipo.listaBlanca} opciones={[["registered", "Registrado", "exito"], ["not_registered", "No registrado", "falta"]]} onChange={(valor) => actualizarEquipo(equipo.id, { listaBlanca: valor })} /><GrupoChecks etiqueta="Condición" valor={equipo.condicion} opciones={[["new", "Nuevo", "accion"], ["used", "Segunda mano", "alerta"]]} onChange={(valor) => actualizarEquipo(equipo.id, { condicion: valor })} /></div></fieldset>)}
        <button type="button" disabled={equipos.length >= 50} onClick={() => setEquipos((anteriores) => [...anteriores, equipoVacio()])} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-accion/45 bg-superficie px-3 text-[0.875rem] font-semibold text-accion active:bg-accion/10 disabled:opacity-40"><Plus aria-hidden="true" className="size-4" strokeWidth={2.3} />Agregar otro equipo</button>
      </section>

      {productoExistente === null && <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => refArchivo.current?.click()}
          className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-borde-fuerte bg-superficie text-tinta-tenue transition active:bg-papel-hundido"
        >
          {foto === null ? (
            <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true" fill="none">
              <path
                d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1-1.6h6.6l1 1.6h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          ) : (
            <img src={foto.vista} alt="" className="size-full object-cover" />
          )}
        </button>

        <div className="flex flex-col gap-1">
          <p className="text-[0.9375rem] font-medium">
            {foto === null ? 'Agregar foto' : 'Cambiar foto'}
          </p>
          <p className="text-[0.8125rem] text-tinta-tenue">
            Opcional. Ayuda a reconocerlo en la lista.
          </p>
        </div>

        <input
          ref={refArchivo}
          type="file"
          accept="image/*"
          // `capture` abre la camara directamente en el telefono en lugar del
          // carrete, que es lo que se quiere al dar de alta lo que se tiene en
          // la mano.
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo !== undefined) void elegirFoto(archivo)
            e.target.value = ''
          }}
        />
      </div>

      <CampoTexto
        etiqueta="Nombre"
        value={nombre}
        error={campos.nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="Audífonos Bluetooth"
        autoFocus
        autoComplete="off"
      />

      <CampoTexto
        etiqueta="Modelo"
        value={modelo}
        onChange={(e) => setModelo(e.target.value)}
        placeholder="Galaxy S25"
        autoComplete="off"
      />

      <CampoTexto
        etiqueta="Marca"
        value={marca}
        onChange={(e) => setMarca(e.target.value)}
        placeholder="Samsung"
        autoComplete="off"
        list="marcas-registradas"
      />
      <datalist id="marcas-registradas">
        {(marcas.data?.marcas ?? []).map((opcion) => <option key={opcion.id} value={opcion.nombre} />)}
      </datalist>

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-tinta-suave">Categoría</span>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="min-h-toque rounded-xl border border-borde bg-superficie px-3 text-[1rem]">
          <option value="">Sin categoría</option>
          {(categorias.data?.categorias ?? []).map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          etiqueta="Precio de venta"
          value={precioVenta}
          onChange={(e) => setPrecioVenta(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          sufijo="S/"
        />
        <CampoTexto
          etiqueta="Costo"
          value={precioCosto}
          onChange={(e) => setPrecioCosto(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          sufijo="S/"
          ayuda="Se usa para valuar mermas"
        />
      </div>
      </>}

      <div className="grid grid-cols-[1fr_2fr] gap-2.5 pt-1">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton cargando={enviando} onClick={() => void guardar()}>
          {productoExistente === null ? 'Guardar producto' : `Agregar a ${productoExistente.nombre}`}
        </Boton>
      </div>
    </div>
  )
}

function CampoConEscaner({ etiqueta, value, onChange, onEscanear, error, ayuda, ...atributos }: { etiqueta: string; value: string; onChange: (valor: string) => void; onEscanear?: () => void; error?: string; ayuda?: string; inputMode?: 'text' | 'numeric'; autoComplete?: string; placeholder?: string }) {
  const id = useId()
  const descripcion = error === undefined ? ayuda : error
  const idDescripcion = `${id}-descripcion`

  return <div className="flex flex-col gap-1.5"><label htmlFor={id} className="text-[0.8125rem] font-medium text-tinta-suave">{etiqueta}</label><div className="grid grid-cols-[minmax(0,1fr)_3.25rem] items-center gap-2"><input id={id} value={value} aria-invalid={error !== undefined} aria-describedby={descripcion === undefined ? undefined : idDescripcion} onChange={(evento) => onChange(evento.target.value)} className={`w-full rounded-xl border bg-superficie px-4 py-3.5 text-[1rem] text-tinta placeholder:text-tinta-tenue transition-colors duration-100 focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${error === undefined ? 'border-borde' : 'border-falta'}`} {...atributos} /><button type="button" aria-label={`Escanear ${etiqueta}`} disabled={onEscanear === undefined} onClick={onEscanear} className="flex size-[3.25rem] items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion transition active:scale-95 active:bg-accion/20 disabled:hidden"><ScanLine aria-hidden="true" className="size-5" strokeWidth={2} /></button></div>{descripcion !== undefined && <p id={idDescripcion} className={`text-[0.75rem] ${error === undefined ? 'text-tinta-tenue' : 'font-medium text-falta'}`}>{descripcion}</p>}</div>
}

function GrupoChecks<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: readonly (readonly [T, string, 'exito' | 'falta' | 'accion' | 'alerta'])[]; onChange: (valor: T) => void }) {
  const nombre = useId()
  return <fieldset className="min-w-0"><legend className="mb-1.5 text-[0.75rem] font-semibold text-tinta-suave">{etiqueta}</legend><div className="grid grid-cols-1 gap-1.5">{opciones.map(([id, texto, tono]) => <OpcionCheck key={id} nombre={nombre} texto={texto} marcada={valor === id} tono={tono} onChange={() => onChange(id)} />)}</div></fieldset>
}

function OpcionCheck({ nombre, texto, marcada, tono, onChange }: { nombre: string; texto: string; marcada: boolean; tono: 'exito' | 'falta' | 'accion' | 'alerta'; onChange: () => void }) {
  const color = tono === 'exito' ? 'border-exito bg-exito-tenue text-exito' : tono === 'falta' ? 'border-falta bg-falta-tenue text-falta' : tono === 'alerta' ? 'border-alerta bg-alerta-tenue text-alerta' : 'border-accion bg-accion-tenue text-accion'
  return <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[0.75rem] font-semibold transition ${marcada ? color : 'border-borde bg-superficie text-tinta-suave'}`}><input type="radio" name={nombre} className="sr-only" checked={marcada} onChange={onChange} /><span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${marcada ? 'border-current bg-current text-white' : 'border-borde-fuerte'}`}>{marcada && <Check className="size-3" strokeWidth={3} />}</span>{texto}</label>
}
