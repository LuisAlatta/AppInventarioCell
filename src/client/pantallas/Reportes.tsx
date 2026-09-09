/**
 * Reportes.
 *
 * El de mermas va primero porque es la razon por la que existe la app. Los
 * demas responden preguntas de operacion: que reponer, cuanto vale el
 * inventario, que dinero esta detenido en producto que no se vende.
 *
 * Nada de graficas de linea: con cuatro ubicaciones, una lista ordenada por
 * dinero perdido dice mas y se lee de un vistazo en un telefono.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/cliente'
import { Esqueleto, ErrorEnPantalla, Etiqueta, Vacio } from '../componentes/Estados'
import { RenglonProducto } from '../componentes/FichaProducto'
import { Marco } from '../componentes/Marco'
import { dinero, dineroRedondo, numero, porcentaje } from '../lib/formato'

type Pestana = 'mermas' | 'reponer' | 'valor' | 'detenido'

const PESTANAS: readonly { valor: Pestana; texto: string }[] = [
  { valor: 'mermas', texto: 'Mermas' },
  { valor: 'reponer', texto: 'Reponer' },
  { valor: 'valor', texto: 'Valor' },
  { valor: 'detenido', texto: 'Detenido' },
]

export function Reportes() {
  const [pestana, setPestana] = useState<Pestana>('mermas')

  return (
    <Marco titulo="Reportes" atras sinUbicacion>
      <div className="flex flex-col gap-4">
        <div
          role="tablist"
          aria-label="Tipo de reporte"
          className="flex gap-1 overflow-x-auto rounded-2xl bg-papel-hundido p-1"
        >
          {PESTANAS.map((opcion) => (
            <button
              key={opcion.valor}
              type="button"
              role="tab"
              aria-selected={pestana === opcion.valor}
              onClick={() => setPestana(opcion.valor)}
              className={[
                'min-h-11 flex-1 rounded-xl px-3 text-[0.9375rem] font-semibold whitespace-nowrap transition',
                pestana === opcion.valor
                  ? 'bg-superficie text-tinta shadow-sm'
                  : 'text-tinta-tenue',
              ].join(' ')}
            >
              {opcion.texto}
            </button>
          ))}
        </div>

        {pestana === 'mermas' && <Mermas />}
        {pestana === 'reponer' && <Reponer />}
        {pestana === 'valor' && <Valor />}
        {pestana === 'detenido' && <Detenido />}
      </div>
    </Marco>
  )
}

function Mermas() {
  const [meses, setMeses] = useState(6)
  const consulta = useQuery({ queryKey: ['mermas', meses], queryFn: () => api.mermas(meses) })

  if (consulta.isPending) return <Esqueleto filas={4} />

  if (consulta.isError) {
    return (
      <ErrorEnPantalla
        mensaje="No se pudo cargar el reporte de mermas."
        onReintentar={() => void consulta.refetch()}
      />
    )
  }

  const { ubicaciones, productos } = consulta.data
  const conMerma = ubicaciones.filter((u) => u.dineroFaltante > 0)
  const totalPerdido = conMerma.reduce((suma, u) => suma + u.dineroFaltante, 0)
  const peor = conMerma[0]

  if (ubicaciones.length === 0) {
    return (
      <Vacio
        titulo="Todavia no hay conteos cerrados"
        detalle="Haz un conteo fisico de una sucursal. Al cerrarlo, aqui apareceran los faltantes."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1.5">
        {[3, 6, 12].map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setMeses(opcion)}
            className={[
              'min-h-10 rounded-xl px-3.5 text-[0.875rem] font-semibold transition',
              meses === opcion
                ? 'bg-accion-tenue text-accion-viva'
                : 'bg-superficie text-tinta-tenue border border-borde',
            ].join(' ')}
          >
            {opcion} meses
          </button>
        ))}
      </div>

      <section
        className={[
          'flex flex-col gap-1 rounded-tarjeta border p-5',
          totalPerdido > 0 ? 'border-falta/30 bg-falta-tenue' : 'border-exito/30 bg-exito-tenue',
        ].join(' ')}
      >
        <p className="text-etiqueta text-tinta-suave uppercase">Perdido en el periodo</p>
        <p
          className={[
            'cifras text-cifra',
            totalPerdido > 0 ? 'text-falta' : 'text-exito',
          ].join(' ')}
        >
          {dinero(totalPerdido)}
        </p>

        {peor !== undefined && totalPerdido > 0 && (
          <p className="text-[0.9375rem] leading-relaxed text-tinta-suave">
            La mayor parte en <strong className="font-semibold">{peor.ubicacionNombre}</strong>:{' '}
            {dinero(peor.dineroFaltante)}, {porcentaje(peor.porcentajeMerma)} de su inventario.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Etiqueta>Por ubicacion</Etiqueta>

        <ul className="flex flex-col gap-2">
          {ubicaciones.map((ubicacion) => {
            // La barra se mide contra la peor ubicacion, no contra el total:
            // asi la comparacion entre sucursales se ve de inmediato.
            const proporcion =
              peor === undefined || peor.dineroFaltante === 0
                ? 0
                : ubicacion.dineroFaltante / peor.dineroFaltante

            return (
              <li
                key={ubicacion.ubicacionId}
                className="flex flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <p className="truncate text-[1rem] font-semibold">{ubicacion.ubicacionNombre}</p>
                    <p className="text-[0.8125rem] text-tinta-tenue">
                      {numero(ubicacion.conteos)} conteos ·{' '}
                      {numero(ubicacion.piezasFaltantes)} piezas
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end">
                    <span
                      className={[
                        'cifras text-[1.25rem] font-semibold',
                        ubicacion.dineroFaltante > 0 ? 'text-falta' : 'text-exito',
                      ].join(' ')}
                    >
                      {dineroRedondo(ubicacion.dineroFaltante)}
                    </span>
                    <span className="cifras text-[0.75rem] text-tinta-tenue">
                      {porcentaje(ubicacion.porcentajeMerma)}
                    </span>
                  </div>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-papel-hundido">
                  <div
                    className="h-full rounded-full bg-falta"
                    style={{ width: `${Math.max(proporcion * 100, ubicacion.dineroFaltante > 0 ? 4 : 0)}%` }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {productos.length > 0 && (
        <section className="flex flex-col gap-2">
          <Etiqueta>Lo que mas se pierde</Etiqueta>

          <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            {productos.map((producto) => (
              <li
                key={producto.productoId}
                className="flex items-center justify-between gap-3 px-3.5 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <p className="truncate text-[0.9375rem] font-medium">{producto.productoNombre}</p>
                  <p className="cifras text-[0.8125rem] text-tinta-tenue">
                    {numero(producto.piezas)} piezas
                  </p>
                </div>
                <span className="cifras shrink-0 text-[1rem] font-semibold text-falta">
                  {dineroRedondo(producto.dinero)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Reponer() {
  const navegar = useNavigate()
  const consulta = useQuery({ queryKey: ['stock-bajo'], queryFn: api.stockBajo })

  if (consulta.isPending) return <Esqueleto filas={4} />

  if (consulta.isError) {
    return (
      <ErrorEnPantalla
        mensaje="No se pudo cargar el reporte."
        onReintentar={() => void consulta.refetch()}
      />
    )
  }

  if (consulta.data.productos.length === 0) {
    return (
      <Vacio
        titulo="Nada por reponer"
        detalle="Ningun producto esta por debajo de su minimo. Puedes fijar minimos desde la ficha de cada producto."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {consulta.data.productos.map((producto) => (
        <li key={producto.id}>
          <RenglonProducto
            producto={producto}
            onClick={() => navegar(`/producto/${producto.id}`)}
            derecha={
              <div className="flex shrink-0 flex-col items-end">
                <span className="cifras text-[1.375rem] font-semibold text-alerta">
                  {numero(producto.stockTotal)}
                </span>
                <span className="cifras text-[0.6875rem] text-tinta-tenue">
                  min {numero(producto.stockMinimo)}
                </span>
              </div>
            }
          />
        </li>
      ))}
    </ul>
  )
}

function Valor() {
  const consulta = useQuery({ queryKey: ['valor'], queryFn: api.valorInventario })

  if (consulta.isPending) return <Esqueleto filas={3} />

  if (consulta.isError) {
    return (
      <ErrorEnPantalla
        mensaje="No se pudo cargar el valor del inventario."
        onReintentar={() => void consulta.refetch()}
      />
    )
  }

  const total = consulta.data.ubicaciones.reduce((suma, u) => suma + u.valor, 0)
  const piezas = consulta.data.ubicaciones.reduce((suma, u) => suma + u.piezas, 0)

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-tarjeta border border-borde bg-superficie p-5">
        <p className="text-etiqueta text-tinta-suave uppercase">Valor total al costo</p>
        <p className="cifras text-cifra">{dinero(total)}</p>
        <p className="cifras text-[0.9375rem] text-tinta-tenue">{numero(piezas)} piezas</p>
      </section>

      <ul className="divide-y divide-borde overflow-hidden rounded-tarjeta border border-borde bg-superficie">
        {consulta.data.ubicaciones.map((ubicacion) => (
          <li
            key={ubicacion.ubicacionId}
            className="flex items-center justify-between gap-3 px-3.5 py-3"
          >
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-[0.9375rem] font-medium">{ubicacion.ubicacionNombre}</p>
              <p className="cifras text-[0.8125rem] text-tinta-tenue">
                {numero(ubicacion.piezas)} piezas
              </p>
            </div>
            <span className="cifras shrink-0 text-[1.0625rem] font-semibold">
              {dineroRedondo(ubicacion.valor)}
            </span>
          </li>
        ))}
      </ul>

      <p className="rounded-xl bg-papel-hundido px-4 py-3 text-[0.8125rem] leading-relaxed text-tinta-tenue">
        Se valua al costo de compra, no al precio de venta. Es el dinero que esta invertido en
        mercancia.
      </p>
    </div>
  )
}

function Detenido() {
  const navegar = useNavigate()
  const [dias, setDias] = useState(60)
  const consulta = useQuery({
    queryKey: ['sin-movimiento', dias],
    queryFn: () => api.sinMovimiento(dias),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5">
        {[30, 60, 90].map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => setDias(opcion)}
            className={[
              'min-h-10 rounded-xl px-3.5 text-[0.875rem] font-semibold transition',
              dias === opcion
                ? 'bg-accion-tenue text-accion-viva'
                : 'bg-superficie text-tinta-tenue border border-borde',
            ].join(' ')}
          >
            {opcion} dias
          </button>
        ))}
      </div>

      {consulta.isPending && <Esqueleto filas={4} />}

      {consulta.isError && (
        <ErrorEnPantalla
          mensaje="No se pudo cargar el reporte."
          onReintentar={() => void consulta.refetch()}
        />
      )}

      {consulta.isSuccess && consulta.data.productos.length === 0 && (
        <Vacio
          titulo="Todo se esta moviendo"
          detalle={`Ningun producto con existencias lleva ${dias} dias sin movimiento.`}
        />
      )}

      {consulta.isSuccess && consulta.data.productos.length > 0 && (
        <>
          <p className="px-1 text-[0.8125rem] leading-relaxed text-tinta-tenue">
            Producto con existencias que no ha entrado ni salido en {dias} dias. Es dinero
            detenido: conviene rematarlo o dejar de comprarlo.
          </p>

          <ul className="flex flex-col gap-2">
            {consulta.data.productos.map((producto) => (
              <li key={producto.id}>
                <RenglonProducto
                  producto={producto}
                  onClick={() => navegar(`/producto/${producto.id}`)}
                  derecha={
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="cifras text-[1.125rem] font-semibold">
                        {dineroRedondo(producto.stockTotal * producto.precioCosto)}
                      </span>
                      <span className="cifras text-[0.6875rem] text-tinta-tenue">
                        {numero(producto.stockTotal)} piezas
                      </span>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
