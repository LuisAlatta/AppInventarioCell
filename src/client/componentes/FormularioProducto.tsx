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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronDown, ImageUp, PackageCheck, Plus, ScanLine, Search, Trash2, X } from 'lucide-react'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { CampoMarcaPredictivo } from './CampoMarcaPredictivo'
import { ModalRecorteImagen } from './ModalRecorteImagen'
import { useAvisos } from '../contexto/Avisos'
import { liberarVista, prepararFoto } from '../lib/imagen'
import { registrarEquiposConRecuperacion, resolverProductoGuardado } from '../lib/registro'
import { useUbicacion } from '../contexto/Ubicacion'
import { leerCodigoDeFoto } from '../escaner/lecturaCodigo'
import { validarDuplicadosLocales, validarFormatoImei, verificarImeiEnBd } from '../lib/validacionImei'

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
    // `randomUUID` no existe en algunos Safari instalados como app. Un id
    // local solo identifica esta fila mientras el formulario está abierto.
    id: typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `equipo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    imei1: '',
    imei2: '',
    listaBlanca: 'not_registered',
    condicion: 'new',
  }
}

function nuevaOperacion(): string {
  const id = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `operacion-${id}`
}

interface FormularioProductoProps {
  codigoInicial?: string
  onEscanear?: (campo: CampoEscaneable) => void
  lectura?: { campo: CampoEscaneable; valor: string } | null
  fotoParaRecortar?: { campo: CampoEscaneable; archivo: Blob } | null
  onCreado: (producto: ProductoConStock) => void
  onCancelar: () => void
}

export function FormularioProducto({ codigoInicial = '', onEscanear, lectura = null, fotoParaRecortar = null, onCreado, onCancelar }: FormularioProductoProps) {
  const avisos = useAvisos()
  const { activa } = useUbicacion()

  const [codigo, setCodigo] = useState(codigoInicial)
  const [productoExistente, setProductoExistente] = useState<ProductoConStock | null>(null)
  const [consultaModelo, setConsultaModelo] = useState('')
  const [mostrarModelos, setMostrarModelos] = useState(false)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [equipos, setEquipos] = useState<DatosEquipoNuevo[]>([equipoVacio()])
  const [precioVenta, setPrecioVenta] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [fotos, setFotos] = useState<Array<{ id: string; archivo: Blob; vista: string }>>([])
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [leyendoFoto, setLeyendoFoto] = useState<CampoEscaneable | null>(null)
  const [idOperacionProducto] = useState(nuevaOperacion)
  const [idOperacionEquipos] = useState(nuevaOperacion)
  const [recortePendiente, setRecortePendiente] = useState<{
    archivo: File | Blob
    titulo: string
    subtitulo?: string
    onListo: (resultado: Blob) => void
  } | null>(null)

  const refArchivoGaleria = useRef<HTMLInputElement | null>(null)
  const refArchivoCamara = useRef<HTMLInputElement | null>(null)
  const refBusquedaModelo = useRef<HTMLDivElement | null>(null)
  const queryClient = useQueryClient()
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categorias })
  const modelosExistentes = useQuery({
    queryKey: ['modelos-existentes', consultaModelo],
    queryFn: () => api.buscar(consultaModelo),
    enabled: mostrarModelos,
  })

  useEffect(() => {
    if (lectura === null) return
    if (lectura.campo === 'codigo') setCodigo(lectura.valor)
    if (lectura.campo !== 'codigo') {
      const [campo, id] = lectura.campo.split(':') as ['imei1' | 'imei2', string]
      const indice = equipos.findIndex((e) => e.id === id)
      if (indice !== -1) {
        manejarCambioImei(indice, id, campo, lectura.valor)
      } else {
        setEquipos((anteriores) => anteriores.map((equipo) => equipo.id === id ? { ...equipo, [campo]: lectura.valor.replace(/\D/g, '') } : equipo))
      }
    }
  }, [lectura])

  useEffect(() => {
    if (!fotoParaRecortar) return
    const etiqueta =
      fotoParaRecortar.campo === 'codigo'
        ? 'código de barras'
        : fotoParaRecortar.campo.startsWith('imei1:')
          ? 'IMEI 1'
          : 'IMEI 2'
    iniciarLecturaFoto(fotoParaRecortar.campo, etiqueta, fotoParaRecortar.archivo)
  }, [fotoParaRecortar])

  useEffect(() => {
    if (!mostrarModelos) return

    const cerrarAlTocarFuera = (evento: PointerEvent): void => {
      if (evento.target instanceof Node && !refBusquedaModelo.current?.contains(evento.target)) setMostrarModelos(false)
    }

    document.addEventListener('pointerdown', cerrarAlTocarFuera)
    return () => document.removeEventListener('pointerdown', cerrarAlTocarFuera)
  }, [mostrarModelos])

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

  // Validación reactiva de IMEIs mientras el usuario digita (duplicados y existencia en BD)
  useEffect(() => {
    let cancelado = false

    const temporizador = window.setTimeout(async () => {
      const erroresDuplicados = validarDuplicadosLocales(equipos)
      const nuevosErroresBd: Record<string, string> = {}

      for (const [indice, eq] of equipos.entries()) {
        for (const tipo of ['imei1', 'imei2'] as const) {
          const valor = eq[tipo].trim()
          const clave = `equipos.${indice}.${tipo}`

          if (valor === '') continue
          if (erroresDuplicados[clave] !== undefined) continue

          if (/^\d{14,17}$/.test(valor)) {
            const yaExiste = await verificarImeiEnBd(valor)
            if (cancelado) return
            if (yaExiste) {
              nuevosErroresBd[clave] = 'Este IMEI ya está registrado en el inventario'
            }
          }
        }
      }

      if (cancelado) return

      setCampos((prev) => {
        const siguiente = { ...prev }
        for (const k of Object.keys(siguiente)) {
          if (k.startsWith('equipos.') && (k.endsWith('.imei1') || k.endsWith('.imei2'))) {
            if (erroresDuplicados[k] === undefined && nuevosErroresBd[k] === undefined) {
              if (
                siguiente[k]?.includes('ya está') ||
                siguiente[k]?.includes('deben ser distintos')
              ) {
                delete siguiente[k]
              }
            }
          }
        }
        return { ...siguiente, ...erroresDuplicados, ...nuevosErroresBd }
      })
    }, 300)

    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
    }
  }, [equipos])

  const manejarCambioImei = (
    indice: number,
    equipoId: string,
    tipo: 'imei1' | 'imei2',
    valorRaw: string,
  ): void => {
    const soloNumeros = valorRaw.replace(/\D/g, '').slice(0, 17)
    actualizarEquipo(equipoId, { [tipo]: soloNumeros })

    const clave = `equipos.${indice}.${tipo}`
    setCampos((prev) => {
      const copia = { ...prev }
      const res = validarFormatoImei(soloNumeros)
      if (!res.valido) {
        copia[clave] = res.error ?? res.ayuda ?? 'El IMEI debe tener entre 14 y 17 dígitos'
        if (indice === 0 && tipo === 'imei1') copia.imei1 = copia[clave]
      } else {
        delete copia[clave]
        if (indice === 0 && tipo === 'imei1') delete copia.imei1
      }
      return copia
    })
  }

  const leerFotoDeCodigo = async (campo: CampoEscaneable, archivo: Blob | File): Promise<void> => {
    setLeyendoFoto(campo)
    try {
      const valor = await leerCodigoDeFoto(archivo)
      if (valor === null) {
        avisos.error('No se encontró un código de barras legible en esa foto')
        return
      }
      if (campo === 'codigo') setCodigo(valor)
      else {
        const [tipo, id] = campo.split(':') as ['imei1' | 'imei2', string]
        const indice = equipos.findIndex((e) => e.id === id)
        if (indice !== -1) {
          manejarCambioImei(indice, id, tipo, valor)
        } else {
          actualizarEquipo(id, { [tipo]: valor.replace(/\D/g, '') })
        }
      }
    } catch {
      avisos.error('No se pudo leer esa foto. Prueba con otra más nítida.')
    } finally {
      setLeyendoFoto(null)
    }
  }

  const iniciarLecturaFoto = (campo: CampoEscaneable, etiqueta: string, archivo: File | Blob): void => {
    setRecortePendiente({
      archivo,
      titulo: `Recortar ${etiqueta}`,
      subtitulo: 'Enfoca las líneas del código o usa la foto completa',
      onListo: (resultado) => {
        void leerFotoDeCodigo(campo, resultado)
      },
    })
  }

  // Las URL de vista previa hay que liberarlas o se acumulan en memoria
  // durante una sesion de altas.
  useEffect(() => {
    return () => {
      for (const f of fotos) liberarVista(f.vista)
    }
  }, [fotos])

  const elegirFotos = async (archivos: FileList | null): Promise<void> => {
    if (archivos === null || archivos.length === 0) return
    const cupo = 5 - fotos.length
    if (cupo <= 0) {
      avisos.información('El límite es de 5 fotos por producto')
      return
    }

    if (archivos.length === 1 && archivos[0]) {
      const archivoUnico = archivos[0]
      setRecortePendiente({
        archivo: archivoUnico,
        titulo: 'Ajustar foto del producto',
        subtitulo: 'Puedes recortar el encuadre o usar la foto completa',
        onListo: async (resultado) => {
          try {
            const preparada = await prepararFoto(resultado)
            setFotos((anteriores) => {
              if (anteriores.length >= 5) {
                liberarVista(preparada.vista)
                return anteriores
              }
              return [
                ...anteriores,
                {
                  id: Math.random().toString(36).slice(2, 9),
                  archivo: preparada.archivo,
                  vista: preparada.vista,
                },
              ]
            })
            avisos.exito('Foto agregada')
          } catch {
            avisos.error('No se pudo procesar la foto')
          }
        },
      })
      return
    }

    const seleccionados = Array.from(archivos).slice(0, cupo)
    const procesadas: Array<{ id: string; archivo: Blob; vista: string }> = []

    for (const archivo of seleccionados) {
      try {
        const preparada = await prepararFoto(archivo)
        procesadas.push({
          id: Math.random().toString(36).slice(2, 9),
          archivo: preparada.archivo,
          vista: preparada.vista,
        })
      } catch {
        avisos.error(`No se pudo procesar ${archivo.name}`)
      }
    }

    if (procesadas.length > 0) {
      setFotos((anteriores) => [...anteriores, ...procesadas])
    }
  }

  const quitarFoto = (id: string) => {
    setFotos((anteriores) => {
      const victima = anteriores.find((f) => f.id === id)
      if (victima) liberarVista(victima.vista)
      return anteriores.filter((f) => f.id !== id)
    })
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

    const erroresDuplicados = validarDuplicadosLocales(equipos)
    const erroresImei: Record<string, string> = { ...erroresDuplicados }
    for (const [i, eq] of equipos.entries()) {
      if (eq.imei1.trim() !== '' && !/^\d{14,17}$/.test(eq.imei1.trim())) {
        erroresImei[`equipos.${i}.imei1`] = 'El IMEI debe tener entre 14 y 17 dígitos'
        erroresImei.imei1 ??= 'El IMEI debe tener entre 14 y 17 dígitos'
      }
      if (eq.imei2.trim() !== '' && !/^\d{14,17}$/.test(eq.imei2.trim())) {
        erroresImei[`equipos.${i}.imei2`] = 'El IMEI debe tener entre 14 y 17 dígitos'
        erroresImei.imei2 ??= 'El IMEI debe tener entre 14 y 17 dígitos'
      }
    }

    for (const [clave, mensaje] of Object.entries(campos)) {
      if (clave.startsWith('equipos.') && mensaje) {
        erroresImei[clave] = mensaje
      }
    }

    if (Object.keys(erroresImei).length > 0) {
      setCampos((prev) => ({ ...prev, ...erroresImei }))
      avisos.error(Object.values(erroresImei)[0] ?? 'Revisa los IMEI ingresados')
      return
    }

    setEnviando(true)
    setCampos({})

    try {
      const producto = productoExistente ?? await resolverProductoGuardado(
        async () => (await api.crearProducto({
          codigo: codigo.trim(),
          nombre: nombre.trim(),
          marca: marca.trim() === '' ? null : marca.trim(),
          modelo: null,
          categoriaId: categoriaId === '' ? null : categoriaId,
          precioVenta: aNumero(precioVenta),
          precioCosto: aNumero(precioCosto),
          idOperacion: idOperacionProducto,
        })).producto,
      )
      setProductoExistente(producto)

      const hayImei = equiposConImei.length > 0
      if (hayImei && activa !== null) {
        const datosEquipos = {
          productoId: producto.id,
          ubicacionId: activa.id,
          idOperacion: idOperacionEquipos,
          equipos: equiposConImei.map((equipo) => ({
            imei1: equipo.imei1.trim() === '' ? null : equipo.imei1.trim(),
            imei2: equipo.imei2.trim() === '' ? null : equipo.imei2.trim(),
            listaBlanca: equipo.listaBlanca,
            condicion: equipo.condicion,
          })),
        }
        await registrarEquiposConRecuperacion(() => api.registrarEquipos(datosEquipos))
      }

      // La foto se sube después de crear el producto porque necesita su id.
      // Si falla, el producto ya quedó guardado: se avisa pero no se pierde
      // el alta, que es lo que costo trabajo.
      let conFoto = producto
      if (fotos.length > 0) {
        try {
          if (productoExistente === null || !producto.claveImagen) {
            const primera = fotos[0]
            if (primera) {
              const { claveImagen } = await api.subirImagen('producto', producto.id, primera.archivo)
              conFoto = { ...producto, claveImagen }
            }
            for (let i = 1; i < fotos.length; i++) {
              const f = fotos[i]
              if (f) await api.agregarImagenProducto(producto.id, f.archivo)
            }
          } else {
            for (const f of fotos) {
              await api.agregarImagenProducto(producto.id, f.archivo)
            }
          }
          void queryClient.invalidateQueries({ queryKey: ['imagenes', producto.id] })
          void queryClient.invalidateQueries({ queryKey: ['producto', producto.id] })
        } catch {
          avisos.error('El producto se guardó, pero alguna foto no se pudo subir')
        }
      }

      void queryClient.invalidateQueries({ queryKey: ['marcas'] })
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
        onSubirFoto={(archivo) => iniciarLecturaFoto('codigo', 'código de barras', archivo)}
        leyendoFoto={leyendoFoto === 'codigo'}
        inputMode="text"
        autoComplete="off"
        placeholder="Escanea o escribe el código"
        ayuda="El escaneo completa este campo automáticamente."
      />

      <div ref={refBusquedaModelo} className="relative flex flex-col gap-1.5">
        <label htmlFor="buscar-modelo" className="text-[0.8125rem] font-semibold text-tinta-suave">O busca un modelo existente</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 my-auto size-5 text-tinta-tenue" strokeWidth={2} />
          <input
            id="buscar-modelo"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={mostrarModelos}
            value={consultaModelo}
            onFocus={() => setMostrarModelos(true)}
            onChange={(evento) => {
              setConsultaModelo(evento.target.value)
              setMostrarModelos(true)
              if (productoExistente !== null) {
                setProductoExistente(null)
                setCodigo('')
              }
            }}
            placeholder="Escribe nombre, marca o modelo"
            autoComplete="off"
            className="min-h-toque w-full rounded-xl border border-borde bg-superficie py-3 pl-10 pr-3 text-[1rem] text-tinta placeholder:text-tinta-tenue focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15"
          />
        </div>
        {mostrarModelos && modelosExistentes.isSuccess && <ul role="listbox" className="max-h-56 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-sm">{modelosExistentes.data.productos.slice(0, 8).map((producto) => <li key={producto.id}><button type="button" role="option" aria-selected={producto.id === productoExistente?.id} onClick={() => { setProductoExistente(producto); setCodigo(producto.codigo); setConsultaModelo(producto.nombre); if (producto.marca) setMarca(producto.marca); setMostrarModelos(false) }} className="flex min-h-12 w-full flex-col justify-center border-b border-borde px-3 text-left last:border-b-0 active:bg-accion-tenue"><span className="text-[0.875rem] font-semibold">{producto.nombre}</span><span className="text-[0.75rem] text-tinta-tenue">{[producto.marca, producto.modelo].filter(Boolean).join(' · ') || producto.codigo}</span></button></li>)}</ul>}
        {mostrarModelos && modelosExistentes.isSuccess && modelosExistentes.data.productos.length === 0 && <p className="rounded-xl bg-papel-hundido px-3 py-2 text-[0.8125rem] text-tinta-tenue">No hay modelos con esa búsqueda.</p>}
        <span className="text-[0.75rem] text-tinta-tenue">Las sugerencias se actualizan mientras escribes.</span>
      </div>

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
        {equipos.map((equipo, indice) => (
          <fieldset key={equipo.id} className="flex flex-col gap-3 rounded-xl border border-accion/20 bg-superficie p-3">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-[0.8125rem] font-semibold text-tinta">Equipo {indice + 1}</legend>
              {equipos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setEquipos((anteriores) => anteriores.filter((actual) => actual.id !== equipo.id))}
                  aria-label={`Quitar equipo ${indice + 1}`}
                  className="flex size-9 items-center justify-center rounded-lg text-falta active:bg-falta-tenue"
                >
                  <Trash2 aria-hidden="true" className="size-4" strokeWidth={2} />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <CampoConEscaner
                etiqueta="IMEI 1"
                value={equipo.imei1}
                error={campos[`equipos.${indice}.imei1`] ?? (indice === 0 ? campos.imei1 : undefined)}
                ayuda={
                  !campos[`equipos.${indice}.imei1`] &&
                  equipo.imei1.length >= 14 &&
                  equipo.imei1.length <= 17
                    ? `IMEI válido (${equipo.imei1.length} dígitos)`
                    : undefined
                }
                onChange={(valor) => manejarCambioImei(indice, equipo.id, 'imei1', valor)}
                onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei1:${equipo.id}`)}
                onSubirFoto={(archivo) => iniciarLecturaFoto(`imei1:${equipo.id}`, `IMEI 1 (Equipo ${indice + 1})`, archivo)}
                leyendoFoto={leyendoFoto === `imei1:${equipo.id}`}
                inputMode="numeric"
                placeholder="15 dígitos"
              />
              <CampoConEscaner
                etiqueta="IMEI 2"
                value={equipo.imei2}
                error={campos[`equipos.${indice}.imei2`] ?? (indice === 0 ? campos.imei2 : undefined)}
                ayuda={
                  !campos[`equipos.${indice}.imei2`] &&
                  equipo.imei2.length >= 14 &&
                  equipo.imei2.length <= 17
                    ? `IMEI válido (${equipo.imei2.length} dígitos)`
                    : undefined
                }
                onChange={(valor) => manejarCambioImei(indice, equipo.id, 'imei2', valor)}
                onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei2:${equipo.id}`)}
                onSubirFoto={(archivo) => iniciarLecturaFoto(`imei2:${equipo.id}`, `IMEI 2 (Equipo ${indice + 1})`, archivo)}
                leyendoFoto={leyendoFoto === `imei2:${equipo.id}`}
                inputMode="numeric"
                placeholder="Opcional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <GrupoChecks
                etiqueta="Lista blanca"
                valor={equipo.listaBlanca}
                opciones={[["registered", "Registrado", "exito"], ["not_registered", "No registrado", "falta"]]}
                onChange={(valor) => actualizarEquipo(equipo.id, { listaBlanca: valor })}
              />
              <GrupoChecks
                etiqueta="Condición"
                valor={equipo.condicion}
                opciones={[["new", "Nuevo", "accion"], ["used", "Segunda mano", "alerta"]]}
                onChange={(valor) => actualizarEquipo(equipo.id, { condicion: valor })}
              />
            </div>
          </fieldset>
        ))}
        <button type="button" disabled={equipos.length >= 50} onClick={() => setEquipos((anteriores) => [...anteriores, equipoVacio()])} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-accion/45 bg-superficie px-3 text-[0.875rem] font-semibold text-accion active:bg-accion/10 disabled:opacity-40"><Plus aria-hidden="true" className="size-4" strokeWidth={2.3} />Agregar otro equipo</button>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-borde bg-superficie p-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[0.875rem] font-semibold text-tinta">Fotos del producto / equipo</p>
            <p className="text-[0.75rem] text-tinta-suave">
              Sube fotos directo de tu galería o usa la cámara
            </p>
          </div>
          <span className="cifras rounded-lg bg-papel-hundido px-2 py-1 text-[0.75rem] font-semibold text-tinta-suave">
            {fotos.length}/5
          </span>
        </div>

        {fotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-5">
            {fotos.map((f, index) => (
              <div
                key={f.id}
                className="relative aspect-square overflow-hidden rounded-xl border border-borde bg-papel-hundido"
              >
                <img
                  src={f.vista}
                  alt={`Foto ${index + 1}`}
                  className="size-full object-cover"
                />
                {index === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-tinta/80 px-1.5 py-0.5 text-[0.625rem] font-bold text-white uppercase tracking-wider">
                    Principal
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Quitar foto ${index + 1}`}
                  onClick={() => quitarFoto(f.id)}
                  className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-tinta/80 text-white transition active:scale-90"
                >
                  <X className="size-3.5" strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        {fotos.length < 5 && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => refArchivoGaleria.current?.click()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borde bg-papel-hundido px-3 text-[0.875rem] font-semibold text-tinta transition active:bg-borde"
            >
              <ImageUp className="size-4.5 text-accion" strokeWidth={2.25} />
              <span>Subir foto</span>
            </button>

            <button
              type="button"
              onClick={() => refArchivoCamara.current?.click()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-accion/30 bg-accion-tenue px-3 text-[0.875rem] font-semibold text-accion transition active:bg-accion/20"
            >
              <Camera className="size-4.5" strokeWidth={2.25} />
              <span>Tomar foto</span>
            </button>
          </div>
        )}

        <input
          ref={refArchivoGaleria}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void elegirFotos(e.target.files)
            e.target.value = ''
          }}
        />

        <input
          ref={refArchivoCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void elegirFotos(e.target.files)
            e.target.value = ''
          }}
        />
      </section>

      {productoExistente === null && (
        <>
          <CampoTexto
            etiqueta="Modelo"
        value={nombre}
        error={campos.nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="iPhone 15 Pro 128 GB"
        autoComplete="off"
      />

      <CampoMarcaPredictivo
        value={marca}
        onChange={setMarca}
        error={campos.marca}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-semibold text-tinta-suave">Categoría</span>
        <div className="relative">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="min-h-toque w-full appearance-none rounded-xl border border-borde bg-superficie py-3 pl-3 pr-12 text-[1rem] text-tinta transition-colors focus:border-accion focus:outline-none focus:ring-2 focus:ring-accion/15">
            <option value="">Sin categoría</option>
            {(categorias.data?.categorias ?? []).map((opcion) => <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>)}
          </select>
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-lg border-l border-borde bg-papel-hundido text-accion"><ChevronDown className="size-5" strokeWidth={2.25} /></span>
        </div>
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
      </>)}

      <div className="grid grid-cols-[1fr_2fr] gap-2.5 pt-1">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton cargando={enviando} onClick={() => void guardar()}>
          {productoExistente === null ? 'Guardar producto' : `Agregar a ${productoExistente.nombre}`}
        </Boton>
      </div>

      <ModalRecorteImagen
        abierto={recortePendiente !== null}
        archivo={recortePendiente?.archivo ?? null}
        titulo={recortePendiente?.titulo}
        subtitulo={recortePendiente?.subtitulo}
        onConfirmar={(resultado) => {
          const accion = recortePendiente?.onListo
          setRecortePendiente(null)
          accion?.(resultado)
        }}
        onCancelar={() => setRecortePendiente(null)}
      />
    </div>
  )
}

function CampoConEscaner({
  etiqueta,
  value,
  onChange,
  onEscanear,
  onSubirFoto,
  leyendoFoto = false,
  error,
  ayuda,
  ...atributos
}: {
  etiqueta: string
  value: string
  onChange: (valor: string) => void
  onEscanear?: () => void
  onSubirFoto?: (archivo: File | Blob) => void
  leyendoFoto?: boolean
  error?: string
  ayuda?: string
  inputMode?: 'text' | 'numeric'
  autoComplete?: string
  placeholder?: string
}) {
  const id = useId()
  const refFotoCamara = useRef<HTMLInputElement | null>(null)
  const refFotoGaleria = useRef<HTMLInputElement | null>(null)
  const descripcion = error === undefined ? ayuda : error
  const idDescripcion = `${id}-descripcion`

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-tinta-suave">
        {etiqueta}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          value={value}
          aria-invalid={error !== undefined}
          aria-describedby={descripcion === undefined ? undefined : idDescripcion}
          onChange={(evento) => onChange(evento.target.value)}
          className={`min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 py-3.5 text-[1rem] text-tinta placeholder:text-tinta-tenue transition-colors duration-100 focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
            error === undefined ? 'border-borde' : 'border-falta'
          }`}
          {...atributos}
        />

        {/* 1. Tomar foto directamente con la cámara del dispositivo */}
        <input
          ref={refFotoCamara}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0]
            if (archivo !== undefined) onSubirFoto?.(archivo)
            evento.target.value = ''
          }}
        />
        <button
          type="button"
          aria-label={`Tomar foto para ${etiqueta}`}
          title={`Tomar foto con cámara para ${etiqueta}`}
          disabled={onSubirFoto === undefined || leyendoFoto}
          onClick={() => refFotoCamara.current?.click()}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion transition active:scale-95 active:bg-accion/20 disabled:hidden"
        >
          <Camera aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>

        {/* 2. Subir foto desde la galería */}
        <input
          ref={refFotoGaleria}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(evento) => {
            const archivo = evento.target.files?.[0]
            if (archivo !== undefined) onSubirFoto?.(archivo)
            evento.target.value = ''
          }}
        />
        <button
          type="button"
          aria-label={`Subir foto de galería para ${etiqueta}`}
          title={`Subir foto de galería para ${etiqueta}`}
          disabled={onSubirFoto === undefined || leyendoFoto}
          onClick={() => refFotoGaleria.current?.click()}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave transition active:scale-95 active:bg-borde disabled:hidden"
        >
          <ImageUp aria-hidden="true" className="size-5" strokeWidth={2} />
        </button>

        {/* 3. Escáner en vivo con cámara */}
        {onEscanear !== undefined && (
          <button
            type="button"
            aria-label={`Escanear en vivo ${etiqueta}`}
            title={`Escanear en vivo ${etiqueta}`}
            onClick={onEscanear}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion text-white transition active:scale-95 active:bg-accion/90"
          >
            <ScanLine aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        )}
      </div>

      {leyendoFoto && (
        <p className="text-[0.75rem] font-medium text-accion">Leyendo código de la foto…</p>
      )}
      {descripcion !== undefined && (
        <p
          id={idDescripcion}
          className={`text-[0.75rem] ${error === undefined ? 'text-tinta-tenue' : 'font-medium text-falta'}`}
        >
          {descripcion}
        </p>
      )}
    </div>
  )
}

function GrupoChecks<T extends string>({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: T; opciones: readonly (readonly [T, string, 'exito' | 'falta' | 'accion' | 'alerta'])[]; onChange: (valor: T) => void }) {
  const nombre = useId()
  return <fieldset className="min-w-0"><legend className="mb-1.5 text-[0.75rem] font-semibold text-tinta-suave">{etiqueta}</legend><div className="grid grid-cols-1 gap-1.5">{opciones.map(([id, texto, tono]) => <OpcionCheck key={id} nombre={nombre} texto={texto} marcada={valor === id} tono={tono} onChange={() => onChange(id)} />)}</div></fieldset>
}

function OpcionCheck({ nombre, texto, marcada, tono, onChange }: { nombre: string; texto: string; marcada: boolean; tono: 'exito' | 'falta' | 'accion' | 'alerta'; onChange: () => void }) {
  const color = tono === 'exito' ? 'border-exito bg-exito-tenue text-exito' : tono === 'falta' ? 'border-falta bg-falta-tenue text-falta' : tono === 'alerta' ? 'border-alerta bg-alerta-tenue text-alerta' : 'border-accion bg-accion-tenue text-accion'
  return <label className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-[0.75rem] font-semibold transition ${marcada ? color : 'border-borde bg-superficie text-tinta-suave'}`}><input type="radio" name={nombre} className="sr-only" checked={marcada} onChange={onChange} /><span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${marcada ? 'border-current bg-superficie' : 'border-borde-fuerte bg-superficie'}`}>{marcada && <span className="size-2 rounded-full bg-current" />}</span>{texto}</label>
}
