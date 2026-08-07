// Máscaras de input para o cadastro de clientes.
// Cada função recebe o texto digitado e devolve a versão formatada,
// ignorando caracteres não numéricos e limitando ao tamanho do documento.

// CNPJ → 00.000.000/0000-00
export function maskCNPJ(value) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// Telefone → (00) 0000-0000 (fixo) ou (00) 00000-0000 (celular)
export function maskPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

// Validação simples de e-mail (só quando preenchido)
export function isValidEmail(value) {
  if (!value.trim()) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

// Validação de CNPJ pelo tamanho (14 dígitos) — só quando preenchido
export function isValidCNPJLength(value) {
  const digits = value.replace(/\D/g, '')
  return digits.length === 0 || digits.length === 14
}
