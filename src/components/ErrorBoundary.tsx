import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Last-resort safety net — without this, any uncaught render error anywhere in
// the tree unmounts the entire app and leaves users with a blank screen. This
// at least gives them a way back in instead of a dead page.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: 24, textAlign: 'center', gap: 16, fontFamily: 'sans-serif',
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: '#666', maxWidth: 420 }}>
            The app hit an unexpected error and couldn't continue. Reloading usually fixes this —
            your data is saved on your device and hasn't been affected.
          </p>
          <button
            onClick={() => location.reload()}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#0078D4', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload the app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
