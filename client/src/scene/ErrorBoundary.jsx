import { Component } from 'react'

// A single bad or missing asset should not take down the whole 3D view.
// Suspense rejections (e.g. a 404 on a gltf) surface as render errors with
// no built-in recovery, so this boundary resets the scene tree instead of
// leaving the app blank.
export class SceneErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('[Scene3D] render error, resetting scene', error)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) return null
    return this.props.children
  }
}
