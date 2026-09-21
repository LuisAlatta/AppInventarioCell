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
import { useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, ImageUp, PackageCheck, Plus, ScanLine, Sparkles, Trash2, XCircle } from 'lucide-react'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { CampoMarcaPredictivo } from './CampoMarcaPredictivo'
import { HojaInferior } from './HojaInferior'
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
  ubicacionDestinoId?: string
  onCambiarUbicacion?: (id: string) => void
  onCreado: (producto: ProductoConStock, ubicacionNombre?: string) => void
  onCancelar: () => void
}

export function FormularioProducto({
  codigoInicial = '',
  onEscanear,
  lectura = null,
  fotoParaRecortar = null,
  ubicacionDestinoId: propUbicacionDestinoId,
  onCambiarUbicacion,
  onCreado,
  onCancelar,
}: FormularioProductoProps) {
  const avisos = useAvisos()
  const { activa, ubicaciones } = useUbicacion()
  const queryClient = useQueryClient()

  const [codigo, setCodigo] = useState(codigoInicial)
  const [productoExistente, setProductoExistente] = useState<ProductoConStock | null>(null)
  const [tacDetectado, setTacDetectado] = useState<{ marca: string; modelo: string } | null>(null)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [equipos, setEquipos] = useState<DatosEquipoNuevo[]>([equipoVacio()])
  const [ubicacionDestinoIdLocal, setUbicacionDestinoIdLocal] = useState<string>(
    () => propUbicacionDestinoId ?? activa?.id ?? ubicaciones.find((u) => u.activa)?.id ?? '',
  )
  const ubicacionDestinoId = propUbicacionDestinoId ?? ubicacionDestinoIdLocal
  const setUbicacionDestinoId = onCambiarUbicacion ?? setUbicacionDestinoIdLocal
  const [precioVenta, setPrecioVenta] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [fotos, setFotos] = useState<Array<{ id: string; archivo: Blob; vista: string }>>([])
  const fotoPrincipal = fotos[0]
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

  useEffect(() => {
    if (lectura === null) return
    if (lectura.campo === 'codigo') setCodigo(lectura.valor)
    if (lectura.campo !== 'codigo') {
      const [campo, id] = lectura.campo.split(':') as ['imei1' | 'imei2', string]
      const indice = equipos.findIndex((e) => e.id === id)
      if (indice !== -1) {
        manejarCambioImei(indice, id, campo, lectura.valor)
      } else {
        setEquipos((anteriores) => anteriores.map((equipo) => equipo.id === id ? { ...equipo, [campo]: lectura.valor.trim().slice(0, 25) } : equipo))
      }
    }
  }, [lectura])

  useEffect(() => {
    if (!fotoParaRecortar) return
    const etiqueta =
      fotoParaRecortar.campo === 'codigo'
        ? 'código del equipo'
        : fotoParaRecortar.campo.startsWith('imei1:')
          ? 'IMEI 1'
          : 'IMEI 2'
    iniciarLecturaFoto(fotoParaRecortar.campo, etiqueta, fotoParaRecortar.archivo)
  }, [fotoParaRecortar])

  useEffect(() => {
    const codigoLimpio = codigo.trim()
    if (codigoLimpio.length === 0) {
      setProductoExistente(null)
      setTacDetectado(null)
      return undefined
    }

    setProductoExistente((actual) => actual?.codigo === codigoLimpio ? actual : null)
    let vigente = true
    const temporizador = window.setTimeout(async () => {
      // 1. Comprobar si ya existe como producto registrado
      try {
        const { producto } = await api.porCodigo(codigoLimpio)
        if (vigente) {
          setProductoExistente(producto)
          if (producto.marca) setMarca(producto.marca)
        }
      } catch (causa: unknown) {
        if (vigente && causa instanceof ErrorDeApi && causa.estado === 404) {
          setProductoExistente(null)
        }
      }

      // 2. Extraer TAC y consultar catálogo GSMA si tiene al menos 8 dígitos
      const digitos = codigoLimpio.replace(/\D/g, '')
      if (digitos.length >= 8) {
        const tac = digitos.slice(0, 8)
        try {
          const resTac = await api.consultarTac(tac)
          if (vigente && resTac.encontrado && resTac.marca && resTac.modelo) {
            setTacDetectado({ marca: resTac.marca, modelo: resTac.modelo })
            setMarca((actual) => (actual.trim() === '' ? resTac.marca! : actual))
            setNombre((actual) => (actual.trim() === '' ? resTac.modelo! : actual))
          } else if (vigente) {
            setTacDetectado(null)
          }
        } catch {
          if (vigente) setTacDetectado(null)
        }
      } else if (vigente) {
        setTacDetectado(null)
      }

      // 3. Si el código ingresado tiene longitud de IMEI completo (14 a 16 dígitos),
      // sincronizarlo automáticamente con el primer equipo (IMEI 1)
      if (digitos.length >= 14 && digitos.length <= 16 && vigente) {
        setEquipos((anteriores) => {
          if (anteriores.length === 0) return anteriores
          const primero = anteriores[0]
          if (!primero) return anteriores
          if (primero.imei1.trim() === '' || primero.imei1 === codigoLimpio.slice(0, 25)) {
            return [
              { ...primero, imei1: codigoLimpio.slice(0, 25) },
              ...anteriores.slice(1),
            ]
          }
          return anteriores
        })
      }
    }, 250)

    return () => {
      vigente = false
      window.clearTimeout(temporizador)
    }
  }, [codigo])

  const actualizarEquipo = (id: string, cambio: Partial<DatosEquipoNuevo>): void => {
    setEquipos((anteriores) => anteriores.map((equipo) => equipo.id === id ? { ...equipo, ...cambio } : equipo))
  }

  useEffect(() => {
    if (!ubicacionDestinoId && activa?.id) {
      setUbicacionDestinoId(activa.id)
    }
  }, [activa, ubicacionDestinoId])

  const ubicacionDestino = ubicaciones.find((u) => u.id === ubicacionDestinoId && u.activa) ?? activa
  const equiposConImei = equipos.filter((equipo) => equipo.imei1.trim() !== '' || equipo.imei2.trim() !== '')

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

          if (valor.length > 0 && valor.length <= 25) {
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
    const valorLimpio = valorRaw.slice(0, 25)
    actualizarEquipo(equipoId, { [tipo]: valorLimpio })

    if (indice === 0 && tipo === 'imei1' && codigo.trim() === '' && valorLimpio.trim() !== '') {
      setCodigo(valorLimpio)
    }

    const clave = `equipos.${indice}.${tipo}`
    setCampos((prev) => {
      const copia = { ...prev }
      const res = validarFormatoImei(valorLimpio)
      if (!res.valido) {
        copia[clave] = res.error ?? 'El IMEI no puede tener más de 25 caracteres'
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
      if (campo === 'codigo') setCodigo(valor.slice(0, 50))
      else {
        const [tipo, id] = campo.split(':') as ['imei1' | 'imei2', string]
        const indice = equipos.findIndex((e) => e.id === id)
        if (indice !== -1) {
          manejarCambioImei(indice, id, tipo, valor)
        } else {
          actualizarEquipo(id, { [tipo]: valor.trim().slice(0, 25) })
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
    if (codigo.trim().length === 0) {
      setCampos({ codigo: 'Ingresa o escanea un código' })
      avisos.error('Ingresa o escanea un código para el producto')
      return
    }
    if (codigo.trim().length > 50) {
      setCampos({ codigo: 'El código no puede tener más de 50 caracteres' })
      avisos.error('El código no puede tener más de 50 caracteres')
      return
    }

    if (productoExistente !== null && equiposConImei.length === 0) {
      setCampos({ equipos: 'Agrega al menos un IMEI para registrar equipos en este modelo' })
      return
    }

    const destino = ubicacionDestino ?? activa
    if (destino === null) {
      avisos.error('Elige una tienda o almacén antes de guardar')
      return
    }

    if (productoExistente === null && nombre.trim().length === 0) {
      setCampos({ nombre: 'Ponle un nombre al producto' })
      return
    }

    const erroresDuplicados = validarDuplicadosLocales(equipos)
    const erroresImei: Record<string, string> = { ...erroresDuplicados }
    for (const [i, eq] of equipos.entries()) {
      if (eq.imei1.trim().length > 25) {
        erroresImei[`equipos.${i}.imei1`] = 'Máximo 25 caracteres'
        erroresImei.imei1 ??= 'Máximo 25 caracteres'
      }
      if (eq.imei2.trim().length > 25) {
        erroresImei[`equipos.${i}.imei2`] = 'Máximo 25 caracteres'
        erroresImei.imei2 ??= 'Máximo 25 caracteres'
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
      // Categoría automática: todos los productos pertenecen a "Celulares"
      let catCelularesId: string | null = null
      try {
        const catRes = await api.categorias()
        const encontrada = catRes.categorias.find(
          (c) =>
            c.nombre.toLowerCase().trim() === 'celulares' ||
            c.nombre.toLowerCase().trim() === 'celular',
        )
        if (encontrada) {
          catCelularesId = encontrada.id
        } else {
          const nueva = await api.crearCategoria('Celulares')
          catCelularesId = nueva.categoria.id
        }
      } catch {
        // Continuar si falla la obtención o creación de categoría
      }

      const producto = productoExistente ?? await resolverProductoGuardado(
        async () => (await api.crearProducto({
          codigo: codigo.trim(),
          nombre: nombre.trim(),
          marca: marca.trim() === '' ? null : marca.trim(),
          modelo: null,
          categoriaId: catCelularesId,
          precioVenta: aNumero(precioVenta),
          precioCosto: aNumero(precioCosto),
          idOperacion: idOperacionProducto,
        })).producto,
      )
      setProductoExistente(producto)

      const hayImei = equiposConImei.length > 0
      if (hayImei) {
        const datosEquipos = {
          productoId: producto.id,
          ubicacionId: destino.id,
          idOperacion: idOperacionEquipos,
          equipos: equiposConImei.map((equipo) => ({
            imei1: equipo.imei1.trim() === '' ? null : equipo.imei1.trim(),
            imei2: equipo.imei2.trim() === '' ? null : equipo.imei2.trim(),
            listaBlanca: equipo.listaBlanca,
            condicion: equipo.condicion,
          })),
        }
        await registrarEquiposConRecuperacion(() => api.registrarEquipos(datosEquipos))
      } else {
        // Cada registro es único: exactamente 1 unidad por registro
        await api.entrada({
          productoId: producto.id,
          ubicacionId: destino.id,
          cantidad: 1,
          costoUnitario: aNumero(precioCosto) || undefined,
          nota: 'Registro de producto (1 unidad)',
        })
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
      void queryClient.invalidateQueries({ queryKey: ['inicio'] })
      void queryClient.invalidateQueries({ queryKey: ['buscar'] })
      void queryClient.invalidateQueries({ queryKey: ['movimientos'] })
      void queryClient.invalidateQueries({ queryKey: ['producto', producto.id] })
      onCreado(conFoto, destino.nombre)
    } catch (causa) {
      if (causa instanceof ErrorDeApi) {
        setCampos(causa.campos ?? {})
        const primerDetalle = causa.campos && Object.keys(causa.campos).length > 0
          ? Object.values(causa.campos)[0]
          : undefined
        avisos.error(primerDetalle || causa.message)
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
        etiqueta="Código del equipo"
        value={codigo}
        error={campos.codigo}
        onChange={(val) => {
          setCodigo(val)
          if (campos.codigo) {
            setCampos((prev) => {
              const copia = { ...prev }
              delete copia.codigo
              return copia
            })
          }
        }}
        onEscanear={onEscanear === undefined ? undefined : () => onEscanear('codigo')}
        onSubirFoto={(archivo) => iniciarLecturaFoto('codigo', 'código del equipo', archivo)}
        leyendoFoto={leyendoFoto === 'codigo'}
        inputMode="text"
        autoComplete="off"
        placeholder="Escanea o escribe el IMEI o código"
        ayuda="Detecta automáticamente la marca y modelo por IMEI"
      />

      {tacDetectado !== null && productoExistente === null && (
        <div className="flex items-center gap-2.5 rounded-xl border border-accion/30 bg-accion-tenue px-3.5 py-2.5 text-[0.8125rem] text-accion shadow-xs">
          <Sparkles className="size-4.5 shrink-0" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-tinta">Equipo detectado: </span>
            <span className="font-bold text-accion">{tacDetectado.marca} {tacDetectado.modelo}</span>
          </div>
        </div>
      )}

      {productoExistente !== null && (
        <section className="flex flex-col gap-2 rounded-2xl border border-exito/30 bg-exito-tenue p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-exito text-white">
              <PackageCheck aria-hidden="true" className="size-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="text-[0.875rem] font-semibold">Modelo encontrado: {productoExistente.nombre}</p>
              <p className="text-[0.75rem] text-tinta-suave">
                {[productoExistente.marca, productoExistente.modelo].filter(Boolean).join(' · ') || 'Modelo registrado'}
              </p>
            </div>
          </div>
          <p className="rounded-lg bg-superficie/80 px-2.5 py-1.5 text-[0.75rem] text-tinta-suave">
            Nota: Los IMEI ingresados abajo se registrarán como <strong>nuevas unidades</strong> en este modelo. Si deseas <strong>editar o corregir</strong> un equipo existente, hazlo desde la ficha del producto.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-accion/25 bg-accion-tenue p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Datos del equipo</p>
            <p className="text-[0.8125rem] text-tinta-suave">
              Cada IMEI es una unidad individual que se registrará en <strong>{ubicacionDestino?.nombre ?? 'la tienda elegida'}</strong>.
            </p>
          </div>
          <span className="cifras rounded-lg bg-superficie px-2 py-1 text-[0.75rem] font-semibold text-accion">{equipos.length}/50</span>
        </div>
        {campos.equipos !== undefined && <p className="text-[0.75rem] font-medium text-falta">{campos.equipos}</p>}
        {equipos.map((equipo, indice) => (
          <div key={equipo.id} className="flex flex-col gap-3.5 rounded-xl border border-borde bg-superficie p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-2 border-b border-borde/60 pb-2">
              <span className="text-[0.875rem] font-semibold text-tinta">Equipo {indice + 1}</span>
              {equipos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setEquipos((anteriores) => anteriores.filter((actual) => actual.id !== equipo.id))}
                  aria-label={`Quitar equipo ${indice + 1}`}
                  className="flex size-8 items-center justify-center rounded-lg text-falta transition active:bg-falta-tenue"
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
                  equipo.imei1.trim().length > 0
                    ? `${equipo.imei1.trim().length}/25 caracteres`
                    : undefined
                }
                onChange={(valor) => manejarCambioImei(indice, equipo.id, 'imei1', valor)}
                onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei1:${equipo.id}`)}
                onSubirFoto={(archivo) => iniciarLecturaFoto(`imei1:${equipo.id}`, `IMEI 1 (Equipo ${indice + 1})`, archivo)}
                leyendoFoto={leyendoFoto === `imei1:${equipo.id}`}
                inputMode="text"
                placeholder="Hasta 25 caracteres"
              />
              <CampoConEscaner
                etiqueta="IMEI 2"
                value={equipo.imei2}
                error={campos[`equipos.${indice}.imei2`] ?? (indice === 0 ? campos.imei2 : undefined)}
                ayuda={
                  !campos[`equipos.${indice}.imei2`] &&
                  equipo.imei2.trim().length > 0
                    ? `${equipo.imei2.trim().length}/25 caracteres`
                    : undefined
                }
                onChange={(valor) => manejarCambioImei(indice, equipo.id, 'imei2', valor)}
                onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei2:${equipo.id}`)}
                onSubirFoto={(archivo) => iniciarLecturaFoto(`imei2:${equipo.id}`, `IMEI 2 (Equipo ${indice + 1})`, archivo)}
                leyendoFoto={leyendoFoto === `imei2:${equipo.id}`}
                inputMode="text"
                placeholder="Opcional (hasta 25 caracteres)"
              />
            </div>

            {/* Opciones de Lista blanca en una sola fila */}
            <div className="flex flex-col gap-1.5 pt-0.5">
              <span className="text-[0.75rem] font-semibold text-tinta-suave">
                Lista blanca
              </span>
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => actualizarEquipo(equipo.id, { listaBlanca: 'registered' })}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold transition leading-none active:scale-[0.98] ${
                    equipo.listaBlanca === 'registered'
                      ? 'border-exito bg-exito-tenue text-exito shadow-xs'
                      : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
                  }`}
                >
                  <CheckCircle2 className="size-4 shrink-0" strokeWidth={2.2} />
                  <span>Registrado</span>
                </button>
                <button
                  type="button"
                  onClick={() => actualizarEquipo(equipo.id, { listaBlanca: 'not_registered' })}
                  className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[0.8125rem] font-semibold transition leading-none active:scale-[0.98] ${
                    equipo.listaBlanca === 'not_registered'
                      ? 'border-falta bg-falta-tenue text-falta shadow-xs'
                      : 'border-borde bg-superficie text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
                  }`}
                >
                  <XCircle className="size-4 shrink-0" strokeWidth={2.2} />
                  <span>No registrado</span>
                </button>
              </div>
            </div>
          </div>
        ))}
        <button type="button" disabled={equipos.length >= 50} onClick={() => setEquipos((anteriores) => [...anteriores, equipoVacio()])} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-accion/45 bg-superficie px-3 text-[0.875rem] font-semibold text-accion active:bg-accion/10 disabled:opacity-40"><Plus aria-hidden="true" className="size-4" strokeWidth={2.3} />Agregar otro equipo</button>
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
        </>
      )}

      {fotoPrincipal !== undefined && (
        <div className="flex items-center gap-2.5 rounded-xl border border-borde bg-superficie p-2.5 shadow-xs">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-borde bg-papel-hundido">
            <img src={fotoPrincipal.vista} alt="Foto seleccionada" className="size-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[0.8125rem] font-semibold text-tinta">Foto adjunta</p>
            <p className="text-[0.75rem] text-tinta-suave truncate">Se guardará con el producto</p>
          </div>
          <button
            type="button"
            onClick={() => quitarFoto(fotoPrincipal.id)}
            aria-label="Quitar foto"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-falta transition active:bg-falta-tenue"
          >
            <Trash2 className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <input
        ref={refArchivoGaleria}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void elegirFotos(e.target.files)
          e.target.value = ''
        }}
      />

      <div className="grid grid-cols-3 gap-2 pt-1">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando} className="px-2 text-[0.875rem]">
          Cancelar
        </Boton>
        <Boton
          tono="suave"
          type="button"
          disabled={enviando}
          onClick={() => refArchivoGaleria.current?.click()}
          className="px-2 text-[0.875rem]"
        >
          <ImageUp className="size-4.5 shrink-0 text-accion" strokeWidth={2} />
          <span className="truncate">Subir foto</span>
        </Boton>
        <Boton cargando={enviando} onClick={() => void guardar()} className="px-2 text-[0.875rem]">
          Guardar
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
  const [mostrarOpciones, setMostrarOpciones] = useState(false)
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
          className={`h-11 min-w-0 flex-1 rounded-xl border bg-superficie px-3.5 text-[1rem] text-tinta placeholder:text-tinta-tenue transition-colors duration-100 focus:border-accion focus:ring-2 focus:ring-accion/15 focus:outline-none ${
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

        {/* Botón único de cámara que despliega las opciones */}
        <button
          type="button"
          aria-label={`Opciones de cámara para ${etiqueta}`}
          title={`Capturar ${etiqueta}`}
          disabled={leyendoFoto}
          onClick={() => setMostrarOpciones(true)}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion transition active:scale-95 active:bg-accion/20 disabled:opacity-50"
        >
          <Camera aria-hidden="true" className="size-5" strokeWidth={2.2} />
        </button>
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

      <HojaInferior
        abierta={mostrarOpciones}
        onCerrar={() => setMostrarOpciones(false)}
        titulo={`Capturar ${etiqueta}`}
      >
        <div className="flex flex-col gap-2.5 pb-2">
          {onEscanear !== undefined && (
            <button
              type="button"
              onClick={() => {
                setMostrarOpciones(false)
                onEscanear()
              }}
              className="flex items-center gap-3.5 rounded-2xl border border-borde bg-superficie p-3.5 text-left transition active:scale-[0.98] active:bg-accion-tenue"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accion text-white shadow-xs">
                <ScanLine className="size-5" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-semibold text-tinta">Escanear en vivo con cámara</p>
                <p className="text-[0.75rem] text-tinta-suave">Apunta la cámara para leer el código en tiempo real</p>
              </div>
            </button>
          )}

          {onSubirFoto !== undefined && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMostrarOpciones(false)
                  refFotoCamara.current?.click()
                }}
                className="flex items-center gap-3.5 rounded-2xl border border-borde bg-superficie p-3.5 text-left transition active:scale-[0.98] active:bg-accion-tenue"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-accion/30 bg-accion-tenue text-accion shadow-xs">
                  <Camera className="size-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold text-tinta">Tomar foto y recortar</p>
                  <p className="text-[0.75rem] text-tinta-suave">Abre la cámara para encuadrar y recortar el código</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMostrarOpciones(false)
                  refFotoGaleria.current?.click()
                }}
                className="flex items-center gap-3.5 rounded-2xl border border-borde bg-superficie p-3.5 text-left transition active:scale-[0.98] active:bg-accion-tenue"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-papel-hundido text-tinta-suave shadow-xs">
                  <ImageUp className="size-5" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-semibold text-tinta">Subir foto de la galería</p>
                  <p className="text-[0.75rem] text-tinta-suave">Selecciona una foto guardada y recorta el código</p>
                </div>
              </button>
            </>
          )}
        </div>
      </HojaInferior>
    </div>
  )
}
