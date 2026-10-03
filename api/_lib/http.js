// Envolve handlers async: erros viram 404 (PGRST116) ou 500 em JSON.
export const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    // PGRST116 = `.single()` não encontrou a linha. Com o filtro de workspace
    // presente em toda consulta, isso cobre tanto id inexistente quanto id de
    // outro workspace — os dois casos devem ser indistinguíveis para quem pede.
    if (err?.code === 'PGRST116') {
      return res.status(404).json({ error: 'Registro não encontrado' })
    }
    console.error(err)
    res.status(500).json({ error: err.message || 'Erro interno' })
  })

