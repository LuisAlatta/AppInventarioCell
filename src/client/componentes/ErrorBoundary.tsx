import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  tieneError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    tieneError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { tieneError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error no controlado capturado por ErrorBoundary:', error, errorInfo)
  }

  private reintentar = () => {
    this.setState({ tieneError: false, error: null })
    window.location.href = '/'
  }

  public override render() {
    if (this.state.tieneError) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-papel p-6 text-center">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-borde bg-superficie p-6 shadow-sm">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-falta-tenue text-falta">
              <AlertTriangle className="size-7" strokeWidth={2} />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-bold text-tinta">Algo no salió como se esperaba</h2>
              <p className="text-sm text-tinta-suave">
                Ocurrió un problema inesperado al mostrar esta sección. Pulsa el botón para continuar.
              </p>
            </div>
            <button
              type="button"
              onClick={this.reintentar}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accion px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition active:scale-[0.98] active:bg-accion-fuerte"
            >
              <RefreshCw className="size-4" strokeWidth={2} />
              <span>Recargar aplicación</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
