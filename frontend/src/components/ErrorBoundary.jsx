import React from 'react'

// Хваща грешки при рендер — особено провалено зареждане на lazy chunk
// (стар index.html сочи към изтрит chunk след нов деплой). В такъв случай
// презарежда страницата ВЕДНЪЖ (guard срещу безкраен цикъл), което взима
// свежия bundle. За други грешки показва дружелюбен екран с бутон.
const CHUNK_RE = /dynamically imported module|Loading chunk|Importing a module|Failed to fetch|ChunkLoadError|error loading dynamically/i

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { err: null }
  }

  static getDerivedStateFromError(err) {
    return { err }
  }

  componentDidCatch(err) {
    const isChunk = CHUNK_RE.test(err?.message || '') || CHUNK_RE.test(err?.name || '')
    if (isChunk) {
      // презареди веднъж — sessionStorage guard да не зациклим
      const k = 'skyrent_chunk_reload'
      if (!sessionStorage.getItem(k)) {
        sessionStorage.setItem(k, String(Date.now()))
        window.location.reload()
        return
      }
    }
    // успешен (не-chunk) рендер по-късно ще изчисти guard-а (виж componentDidUpdate)
  }

  componentDidUpdate(_, prevState) {
    // Ако се възстановим (smяна на таб → нов опит и успех), нулирай guard-а
    if (prevState.err && !this.state.err) sessionStorage.removeItem('skyrent_chunk_reload')
  }

  // Нулирай грешката при смяна на таба (resetKey се променя)
  static getDerivedStateFromProps(props, state) {
    if (state.err && props.resetKey !== state._key) return { err: null, _key: props.resetKey }
    if (state._key === undefined) return { _key: props.resetKey }
    return null
  }

  render() {
    if (this.state.err) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="text-4xl mb-3">🔄</div>
            <div className="text-lg font-semibold text-gray-800 mb-1">Страницата не се зареди докрай</div>
            <div className="text-sm text-gray-500 mb-4">
              Вероятно има нова версия. Презареди, за да продължиш.
            </div>
            <button
              onClick={() => { sessionStorage.removeItem('skyrent_chunk_reload'); window.location.reload() }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
              Презареди
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
