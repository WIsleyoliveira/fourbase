// Spinner de carregamento (usa o .loading-wrap/.spinner de sempre).
export default function LoadingBlock({ text = 'Carregando...' }) {
  return (
    <div className="loading-wrap">
      <div className="spinner" />
      <p>{text}</p>
    </div>
  )
}

// true enquanto alguma das consultas ainda faz a PRIMEIRA carga (revalidações
// com dado em cache não contam — a tela fica de pé).
export const anyLoading = (...queries) => queries.some((q) => q.isLoading)
