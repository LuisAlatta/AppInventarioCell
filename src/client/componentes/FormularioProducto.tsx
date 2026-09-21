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
import { Camera, ImageUp, PackageCheck, ScanLine, Trash2 } from 'lucide-react'
import type { Equipo, ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { CampoMarcaPredictivo } from './CampoMarcaPredictivo'
import { HojaInferior } from './HojaInferior'
import { ModalRecorteImagen } from './ModalRecorteImagen'
import { ModalSelectorCodigos } from './ModalSelectorCodigos'
import { ModalUbicacionImei } from './ModalUbicacionImei'
import { useAvisos } from '../contexto/Avisos'
import { liberarVista, prepararFoto } from '../lib/imagen'
import { avisarDeteccion } from '../lib/retroalimentacion'
import { registrarEquiposConRecuperacion, resolverProductoGuardado } from '../lib/registro'
import { useUbicacion } from '../contexto/Ubicacion'
import { leerCodigoDeFoto, leerTodosLosCodigosDeFoto, type CodigoDetectado } from '../escaner/lecturaCodigo'
import { consultarEquipoPorImei, validarDuplicadosLocales, validarFormatoImei } from '../lib/validacionImei'

export type CampoEscaneable = 'codigo' | `imei1:${string}` | `imei2:${string}`

interface DatosEquipoNuevo {
  id: string
  imei1: string
  imei2: string
  listaBlanca: 'registered' | 'not_registered'
  condicion: 'new' | 'used'
}

function equipoVacio(imeiInicial = ''): DatosEquipoNuevo {
  return {
    // `randomUUID` no existe en algunos Safari instalados como app. Un id
    // local solo identifica esta fila mientras el formulario está abierto.
    id: typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `equipo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    imei1: imeiInicial,
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

  const [productoExistente, setProductoExistente] = useState<ProductoConStock | null>(null)
  const ultimoTacDetectado = useRef<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [equipos, setEquipos] = useState<DatosEquipoNuevo[]>(() => [equipoVacio(codigoInicial)])
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
  const [selectorCodigos, setSelectorCodigos] = useState<{
    campo: CampoEscaneable
    etiqueta: string
    archivo: Blob | File
    codigos: CodigoDetectado[]
  } | null>(null)
  const [equiposDuplicados, setEquiposDuplicados] = useState<
    Record<string, { imei: string; equipo: Equipo }>
  >({})
  const [equipoParaVerUbicacion, setEquipoParaVerUbicacion] = useState<{
    imei: string
    equipo: Equipo
  } | null>(null)

  const refArchivoGaleria = useRef<HTMLInputElement | null>(null)

  const equipoActual = equipos[0] ?? equipoVacio()
  const imei1Actual = equipoActual.imei1

  useEffect(() => {
    if (lectura === null) return
    const tipo = lectura.campo.startsWith('imei2') ? 'imei2' : 'imei1'
    manejarCambioImei(0, equipoActual.id, tipo, lectura.valor)
  }, [lectura])

  useEffect(() => {
    if (!fotoParaRecortar) return
    const etiqueta = fotoParaRecortar.campo.startsWith('imei2') ? 'IMEI 2' : 'IMEI 1'
    void procesarFotoDeCaja(fotoParaRecortar.campo, etiqueta, fotoParaRecortar.archivo)
  }, [fotoParaRecortar])

  useEffect(() => {
    const imeiLimpio = imei1Actual.trim()
    if (imeiLimpio.length === 0) {
      setProductoExistente(null)
      ultimoTacDetectado.current = null
      return undefined
    }

    let vigente = true
    const temporizador = window.setTimeout(async () => {
      // 1. Extraer TAC y consultar catálogo GSMA si tiene al menos 8 dígitos
      const digitos = imeiLimpio.replace(/\D/g, '')
      if (digitos.length >= 8) {
        const tac = digitos.slice(0, 8)
        try {
          const resTac = await api.consultarTac(tac)
          if (vigente && resTac.encontrado && resTac.marca && resTac.modelo) {
            if (ultimoTacDetectado.current !== tac) {
              ultimoTacDetectado.current = tac
              setMarca(resTac.marca)
              setNombre(resTac.modelo)
              avisarDeteccion()
              avisos.exito(`Equipo detectado: ${resTac.marca} ${resTac.modelo}`)
            }
          }
        } catch {
          // Fallo silencioso en consulta TAC
        }
      } else if (vigente) {
        ultimoTacDetectado.current = null
      }

      // 2. Comprobar si ya existe como producto registrado por este IMEI
      try {
        const { producto } = await api.porCodigo(imeiLimpio)
        if (vigente) {
          setProductoExistente(producto)
          if (producto.marca) setMarca(producto.marca)
        }
      } catch (causa: unknown) {
        if (vigente && causa instanceof ErrorDeApi && causa.estado === 404) {
          setProductoExistente(null)
        }
      }
    }, 250)

    return () => {
      vigente = false
      window.clearTimeout(temporizador)
    }
  }, [imei1Actual])

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
      const nuevosEquiposDuplicados: Record<string, { imei: string; equipo: Equipo }> = {}

      for (const [indice, eq] of equipos.entries()) {
        for (const tipo of ['imei1', 'imei2'] as const) {
          const valor = eq[tipo].trim()
          const clave = `equipos.${indice}.${tipo}`

          if (valor === '') continue
          if (erroresDuplicados[clave] !== undefined) continue

          if (valor.length > 0 && valor.length <= 25) {
            const equipoExistente = await consultarEquipoPorImei(valor)
            if (cancelado) return
            if (equipoExistente !== null) {
              nuevosErroresBd[clave] = 'Este IMEI ya está registrado en el inventario'
              nuevosEquiposDuplicados[clave] = { imei: valor, equipo: equipoExistente }
            }
          }
        }
      }

      if (cancelado) return

      setEquiposDuplicados((prev) => {
        const siguiente = { ...prev }
        for (const k of Object.keys(siguiente)) {
          if (nuevosEquiposDuplicados[k] === undefined) {
            delete siguiente[k]
          }
        }
        return { ...siguiente, ...nuevosEquiposDuplicados }
      })

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

  const aplicarCodigoACampo = (campo: CampoEscaneable, valor: string): void => {
    if (campo === 'codigo' || campo.startsWith('imei1')) {
      manejarCambioImei(0, equipoActual.id, 'imei1', valor)
    } else {
      const [tipo, id] = campo.split(':') as ['imei1' | 'imei2', string]
      const indice = equipos.findIndex((e) => e.id === id)
      if (indice !== -1) {
        manejarCambioImei(indice, id, tipo, valor)
      } else {
        actualizarEquipo(id, { [tipo]: valor.trim().slice(0, 25) })
      }
    }
  }

  const leerFotoDeCodigo = async (campo: CampoEscaneable, archivo: Blob | File): Promise<void> => {
    setLeyendoFoto(campo)
    try {
      const valor = await leerCodigoDeFoto(archivo)
      if (valor === null) {
        avisos.error('No se encontró un código de barras legible en esa foto')
        return
      }
      aplicarCodigoACampo(campo, valor)
      avisarDeteccion()
      avisos.exito(`Código detectado: ${valor}`)
    } catch {
      avisos.error('No se pudo leer esa foto. Prueba con otra más nítida.')
    } finally {
      setLeyendoFoto(null)
    }
  }

  const procesarFotoDeCaja = async (
    campo: CampoEscaneable,
    etiqueta: string,
    archivo: File | Blob,
  ): Promise<void> => {
    setLeyendoFoto(campo)
    try {
      const codigos = await leerTodosLosCodigosDeFoto(archivo)
      if (codigos.length === 0) {
        // Si no se encontró ningún código automáticamente, ofrecer recorte manual
        setRecortePendiente({
          archivo,
          titulo: `Recortar ${etiqueta}`,
          subtitulo: 'No se detectó un código claro automáticamente. Encuadra la zona del código:',
          onListo: (resultado) => {
            void leerFotoDeCodigo(campo, resultado)
          },
        })
        return
      }

      if (codigos.length === 1 && codigos[0]) {
        // Solo un código detectado: aplicar directamente
        aplicarCodigoACampo(campo, codigos[0].valorLimpio)
        avisarDeteccion()
        avisos.exito(`Código detectado: ${codigos[0].valorLimpio}`)
        return
      }

      // Múltiples códigos detectados (SN, IMEI 1, IMEI 2, EAN, etc.):
      // Abrir selector táctil para que el usuario elija con un toque o rellene ambos
      setSelectorCodigos({
        campo,
        etiqueta,
        archivo,
        codigos,
      })
    } catch {
      avisos.error('No se pudo procesar la foto. Prueba con otra más nítida.')
    } finally {
      setLeyendoFoto(null)
    }
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
    const imei1Limpio = (equipos[0]?.imei1 ?? '').trim()
    if (imei1Limpio.length === 0) {
      setCampos((prev) => ({ ...prev, 'equipos.0.imei1': 'Ingresa o escanea el IMEI 1' }))
      avisos.error('Ingresa o escanea el IMEI 1 del equipo')
      return
    }
    if (imei1Limpio.length > 25) {
      setCampos((prev) => ({ ...prev, 'equipos.0.imei1': 'El IMEI no puede tener más de 25 caracteres' }))
      avisos.error('El IMEI no puede tener más de 25 caracteres')
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
          codigo: imei1Limpio,
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
    <div className="flex flex-1 flex-col justify-between gap-2.5 min-h-0">
      <div className="flex flex-col gap-2.5">
        <CampoConEscaner
          etiqueta="IMEI 1"
          value={equipoActual.imei1}
          error={campos['equipos.0.imei1'] ?? campos.imei1}
          onChange={(valor) => manejarCambioImei(0, equipoActual.id, 'imei1', valor)}
          onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei1:${equipoActual.id}`)}
          onSubirFoto={(archivo) => void procesarFotoDeCaja(`imei1:${equipoActual.id}`, 'IMEI 1', archivo)}
          onVerUbicacion={
            equiposDuplicados['equipos.0.imei1']
              ? () => setEquipoParaVerUbicacion(equiposDuplicados['equipos.0.imei1'] ?? null)
              : undefined
          }
          leyendoFoto={leyendoFoto === `imei1:${equipoActual.id}`}
          inputMode="text"
        />

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
              Nota: Este equipo se registrará como una <strong>nueva unidad</strong> en este modelo. Si deseas <strong>editar o corregir</strong> un equipo existente, hazlo desde la ficha del producto.
            </p>
          </section>
        )}

        <CampoConEscaner
          etiqueta="IMEI 2"
          value={equipoActual.imei2}
          error={campos['equipos.0.imei2'] ?? campos.imei2}
          onChange={(valor) => manejarCambioImei(0, equipoActual.id, 'imei2', valor)}
          onEscanear={onEscanear === undefined ? undefined : () => onEscanear(`imei2:${equipoActual.id}`)}
          onSubirFoto={(archivo) => void procesarFotoDeCaja(`imei2:${equipoActual.id}`, 'IMEI 2', archivo)}
          onVerUbicacion={
            equiposDuplicados['equipos.0.imei2']
              ? () => setEquipoParaVerUbicacion(equiposDuplicados['equipos.0.imei2'] ?? null)
              : undefined
          }
          leyendoFoto={leyendoFoto === `imei2:${equipoActual.id}`}
          inputMode="text"
        />

        {productoExistente === null ? (
          <>
            <CampoTexto
              etiqueta="Modelo"
              value={nombre}
              error={campos.nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="off"
            />

            <CampoMarcaPredictivo
              value={marca}
              onChange={setMarca}
              error={campos.marca}
              placeholder=""
            />

            {/* Opciones de Lista blanca debajo de Marca: sin iconos, letra grande, blancos en reposo y azul al seleccionarse */}
            <div className="grid grid-cols-2 gap-2 w-full">
              <button
                type="button"
                onClick={() => actualizarEquipo(equipoActual.id, { listaBlanca: 'registered' })}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-[1rem] font-bold tracking-wide transition leading-none active:scale-[0.98] ${
                  equipoActual.listaBlanca === 'registered'
                    ? 'border-accion bg-accion text-white shadow-xs'
                    : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
                }`}
              >
                <span>Registrado</span>
              </button>
              <button
                type="button"
                onClick={() => actualizarEquipo(equipoActual.id, { listaBlanca: 'not_registered' })}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-[1rem] font-bold tracking-wide transition leading-none active:scale-[0.98] ${
                  equipoActual.listaBlanca === 'not_registered'
                    ? 'border-accion bg-accion text-white shadow-xs'
                    : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
                }`}
              >
                <span>No registrado</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CampoTexto
                etiqueta="Costo"
                value={precioCosto}
                onChange={(e) => setPrecioCosto(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                prefijo="S/."
              />
              <CampoTexto
                etiqueta="Precio de venta"
                value={precioVenta}
                onChange={(e) => setPrecioVenta(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                prefijo="S/."
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              type="button"
              onClick={() => actualizarEquipo(equipoActual.id, { listaBlanca: 'registered' })}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-[1rem] font-bold tracking-wide transition leading-none active:scale-[0.98] ${
                equipoActual.listaBlanca === 'registered'
                  ? 'border-accion bg-accion text-white shadow-xs'
                  : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
              }`}
            >
              <span>Registrado</span>
            </button>
            <button
              type="button"
              onClick={() => actualizarEquipo(equipoActual.id, { listaBlanca: 'not_registered' })}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-2 text-[1rem] font-bold tracking-wide transition leading-none active:scale-[0.98] ${
                equipoActual.listaBlanca === 'not_registered'
                  ? 'border-accion bg-accion text-white shadow-xs'
                  : 'border-borde bg-white text-tinta-suave hover:border-borde-fuerte active:bg-papel-hundido'
              }`}
            >
              <span>No registrado</span>
            </button>
          </div>
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
      </div>

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

      <div className="mt-auto grid grid-cols-3 gap-2 pt-2 pb-2">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando} className="px-2 text-[0.9375rem] font-semibold">
          Cancelar
        </Boton>
        <Boton
          tono="suave"
          type="button"
          disabled={enviando}
          onClick={() => refArchivoGaleria.current?.click()}
          className="px-2 text-[0.9375rem] font-semibold"
        >
          <ImageUp className="size-4.5 shrink-0 text-accion" strokeWidth={2} />
          <span>Foto</span>
        </Boton>
        <Boton cargando={enviando} onClick={() => void guardar()} className="px-2 text-[0.9375rem] font-semibold">
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

      <ModalSelectorCodigos
        abierto={selectorCodigos !== null}
        codigos={selectorCodigos?.codigos ?? []}
        campoDestinoNombre={selectorCodigos?.etiqueta}
        onSeleccionarCodigo={(valor) => {
          if (!selectorCodigos) return
          aplicarCodigoACampo(selectorCodigos.campo, valor)
          setSelectorCodigos(null)
          avisarDeteccion()
          avisos.exito(`Código aplicado: ${valor}`)
        }}
        onSeleccionarAmbosImeis={(imeis) => {
          manejarCambioImei(0, equipoActual.id, 'imei1', imeis.imei1)
          manejarCambioImei(0, equipoActual.id, 'imei2', imeis.imei2)
          setSelectorCodigos(null)
          avisarDeteccion()
          avisos.exito('IMEI 1 e IMEI 2 cargados con éxito')
        }}
        onRecortarManualmente={() => {
          if (!selectorCodigos) return
          const { campo, etiqueta, archivo } = selectorCodigos
          setSelectorCodigos(null)
          setRecortePendiente({
            archivo,
            titulo: `Recortar ${etiqueta}`,
            subtitulo: 'Enfoca las líneas del código o usa la foto completa',
            onListo: (resultado) => {
              void leerFotoDeCodigo(campo, resultado)
            },
          })
        }}
        onCancelar={() => setSelectorCodigos(null)}
      />

      <ModalUbicacionImei
        abierto={equipoParaVerUbicacion !== null}
        equipo={equipoParaVerUbicacion?.equipo ?? null}
        imeiConsultado={equipoParaVerUbicacion?.imei}
        onCerrar={() => setEquipoParaVerUbicacion(null)}
      />
    </div>
  )
}

interface CampoConEscanerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  etiqueta: string
  value: string
  onChange: (valor: string) => void
  onEscanear?: () => void
  onSubirFoto?: (archivo: File | Blob) => void
  onVerUbicacion?: () => void
  leyendoFoto?: boolean
  error?: string
  ayuda?: string
}

function CampoConEscaner({
  etiqueta,
  value,
  onChange,
  onEscanear,
  onSubirFoto,
  onVerUbicacion,
  leyendoFoto = false,
  error,
  ayuda,
  ...atributos
}: CampoConEscanerProps) {
  const [mostrarOpciones, setMostrarOpciones] = useState(false)
  const id = useId()
  const idDescripcion = useId()
  const descripcion = error ?? ayuda
  const refFotoCamara = useRef<HTMLInputElement | null>(null)
  const refFotoGaleria = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.875rem] font-semibold text-tinta">
        {etiqueta}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(evento) => onChange(evento.target.value)}
          aria-invalid={error !== undefined}
          aria-describedby={descripcion !== undefined ? idDescripcion : undefined}
          placeholder=""
          className={`h-11 flex-1 rounded-xl border bg-superficie px-3.5 text-[0.9375rem] text-tinta outline-hidden transition focus:border-accion focus:ring-2 focus:ring-accion/20 ${
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
        <p className="text-[0.75rem] font-medium text-accion">Leyendo códigos de la foto…</p>
      )}
      {descripcion !== undefined && (
        <div
          id={idDescripcion}
          className={`flex items-center gap-1.5 flex-wrap text-[0.75rem] ${
            error === undefined ? 'text-tinta-tenue' : 'font-medium text-falta'
          }`}
        >
          <span>{descripcion}</span>
          {onVerUbicacion !== undefined && (
            <button
              type="button"
              onClick={onVerUbicacion}
              className="inline-flex items-center font-bold text-accion underline underline-offset-2 hover:text-accion/80 active:scale-95 transition cursor-pointer"
            >
              Ver
            </button>
          )}
        </div>
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
                  <p className="text-[0.9375rem] font-semibold text-tinta">Tomar foto a la caja</p>
                  <p className="text-[0.75rem] text-tinta-suave">Detecta y separa automáticamente SN, IMEI 1, IMEI 2 y EAN</p>
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
                  <p className="text-[0.75rem] text-tinta-suave">Selecciona una imagen de la caja desde tu galería</p>
                </div>
              </button>
            </>
          )}
        </div>
      </HojaInferior>
    </div>
  )
}
