// Edição otimista do cache de avisos: { items, unread } sob ['notifications', userId].
// Funções puras (não mutam a entrada), testadas em tests/notificationCache.test.js.

// Marca um aviso como lido. `unread` só cai se o aviso estava não lido (e nunca
// abaixo de 0), então repetir a chamada não altera mais nada.
export function markReadInData(data, id, nowIso) {
  const target = data.items.find((n) => n.id === id)
  if (!target || target.read_at) return data
  return {
    ...data,
    items: data.items.map((n) => (n.id === id ? { ...n, read_at: nowIso } : n)),
    unread: Math.max(0, data.unread - 1),
  }
}

export function markAllInData(data, nowIso) {
  return {
    ...data,
    items: data.items.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
    unread: 0,
  }
}
