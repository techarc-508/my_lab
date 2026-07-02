import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-center">
          <p className="text-red-400 text-sm">Something went wrong</p>
          <p className="text-[10px] text-[#5c3f45] mt-1">{this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })} className="mt-3 text-xs text-cyan-400 hover:underline">
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
