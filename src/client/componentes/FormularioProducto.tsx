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

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProductoConStock } from '@compartido/tipos'
import { ErrorDeApi, api } from '../api/cliente'
import { Boton } from './Boton'
import { CampoTexto } from './Campo'
import { useAvisos } from '../contexto/Avisos'
import { liberarVista, prepararFoto } from '../lib/imagen'
import { useUbicacion } from '../contexto/Ubicacion'

interface FormularioProductoProps {
  codigo: string
  onCreado: (producto: ProductoConStock) => void
  onCancelar: () => void
}

export function FormularioProducto({ codigo, onCreado, onCancelar }: FormularioProductoProps) {
  const avisos = useAvisos()
  const { activa } = useUbicacion()

  const [nombre, setNombre] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [imei1, setImei1] = useState('')
  const [imei2, setImei2] = useState('')
  const [listaBlanca, setListaBlanca] = useState<'registered' | 'not_registered'>('not_registered')
  const [condicion, setCondicion] = useState<'new' | 'used'>('new')
  const [precioVenta, setPrecioVenta] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [foto, setFoto] = useState<{ archivo: Blob; vista: string } | null>(null)
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const refArchivo = useRef<HTMLInputElement | null>(null)
  const marcas = useQuery({ queryKey: ['marcas'], queryFn: api.marcas })
  const categorias = useQuery({ queryKey: ['categorias'], queryFn: api.categorias })

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
    if (nombre.trim().length === 0) {
      setCampos({ nombre: 'Ponle un nombre al producto' })
      return
    }

    setEnviando(true)
    setCampos({})

    try {
      const { producto } = await api.crearProducto({
        codigo,
        nombre: nombre.trim(),
        marca: marca.trim() === '' ? null : marca.trim(),
        modelo: modelo.trim() === '' ? null : modelo.trim(),
        categoriaId: categoriaId === '' ? null : categoriaId,
        precioVenta: aNumero(precioVenta),
        precioCosto: aNumero(precioCosto),
      })

      const hayImei = imei1.trim() !== '' || imei2.trim() !== ''
      if (hayImei && activa !== null) {
        await api.registrarEquipos({
          productoId: producto.id,
          ubicacionId: activa.id,
          equipos: [{
            imei1: imei1.trim() === '' ? null : imei1.trim(),
            imei2: imei2.trim() === '' ? null : imei2.trim(),
            listaBlanca,
            condicion,
          }],
        })
      }

      // La foto se sube después de crear el producto porque necesita su id.
      // Si falla, el producto ya quedó guardado: se avisa pero no se pierde
      // el alta, que es lo que costo trabajo.
      let conFoto = producto
      if (foto !== null) {
        try {
          const { claveImagen } = await api.subirImagen('producto', producto.id, foto.archivo)
          conFoto = { ...producto, claveImagen }
        } catch {
          avisos.error('El producto se guardó, pero la foto no se pudo subir')
        }
      }

      onCreado(conFoto)
      if (hayImei && activa === null) {
        avisos.información('Producto creado. Elige una ubicación para registrar sus IMEI.')
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
      <div className="rounded-xl bg-papel-hundido px-4 py-3">
        <p className="text-[0.8125rem] text-tinta-suave">Código escaneado</p>
        <p className="cifras text-[1.125rem] font-semibold">{codigo}</p>
      </div>

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

      <section className="flex flex-col gap-3 rounded-2xl border border-accion/25 bg-accion-tenue p-3.5">
        <div>
          <p className="font-semibold">Datos del equipo</p>
          <p className="text-[0.8125rem] text-tinta-suave">Opcional. Se guarda como una unidad individual en {activa?.nombre ?? 'la ubicación que elijas después'}.</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <CampoTexto etiqueta="IMEI 1" value={imei1} onChange={(e) => setImei1(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="15 dígitos" />
          <CampoTexto etiqueta="IMEI 2" value={imei2} onChange={(e) => setImei2(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <SelectorVisual etiqueta="Lista blanca" opciones={[['registered', 'Registrado'], ['not_registered', 'No registrado']]} valor={listaBlanca} onChange={setListaBlanca} tono="exito" />
          <SelectorVisual etiqueta="Estado" opciones={[['new', 'Nuevo'], ['used', 'Segunda mano']]} valor={condicion} onChange={setCondicion} tono="alerta" />
        </div>
      </section>

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

      <div className="grid grid-cols-[1fr_2fr] gap-2.5 pt-1">
        <Boton tono="contorno" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton cargando={enviando} onClick={() => void guardar()}>
          Guardar producto
        </Boton>
      </div>
    </div>
  )
}

function SelectorVisual<T extends string>({
  etiqueta, opciones, valor, onChange, tono,
}: {
  etiqueta: string
  opciones: readonly (readonly [T, string])[]
  valor: T
  onChange: (valor: T) => void
  tono: 'exito' | 'alerta'
}) {
  const activo = tono === 'exito' ? 'border-exito bg-exito-tenue text-exito' : 'border-alerta bg-alerta-tenue text-alerta'
  return <fieldset className="min-w-0"><legend className="mb-1.5 text-[0.75rem] font-semibold text-tinta-suave">{etiqueta}</legend><div className="flex flex-col gap-1">{opciones.map(([id, texto]) => <button key={id} type="button" aria-pressed={valor === id} onClick={() => onChange(id)} className={`min-h-9 rounded-lg border px-2 text-left text-[0.75rem] font-semibold ${valor === id ? activo : 'border-borde bg-superficie text-tinta-suave'}`}>{texto}</button>)}</div></fieldset>
}
