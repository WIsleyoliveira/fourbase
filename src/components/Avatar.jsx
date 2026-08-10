import { memberColor, memberAvatarUrl } from '../colors.js'

// Avatar de um responsável — usa a foto de perfil cadastrada (aba Perfil),
// quando existir; senão cai no círculo colorido com a inicial do nome,
// mesmo comportamento de antes. Centraliza a lógica para que a foto
// escolhida em "Perfil" apareça automaticamente em toda a plataforma
// (Kanban, Calendário, Equipe, Tarefa) sem duplicar o fallback em cada tela.
export default function Avatar({ id, name, list = [], className = '', style, title }) {
  const url = memberAvatarUrl(id, list)
  const color = memberColor(id, list)
  const initial = (name || '').charAt(0).toUpperCase() || '?'

  if (url) {
    return (
      <img
        src={url}
        alt={name || ''}
        title={title ?? name}
        className={className}
        style={style}
      />
    )
  }

  return (
    <div className={className} style={{ background: color, ...style }} title={title ?? name}>
      {initial}
    </div>
  )
}
