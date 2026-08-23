import { useState } from 'react'
import { IconUserCheck, IconBuilding, IconPlus } from '../icons.jsx'
import TeamMemberModal from './TeamMemberModal.jsx'
import ClientModal from './ClientModal.jsx'

// Central de Cadastros — ponto de partida para cadastrar membros da equipe e clientes.
export default function RegistryView({ isGestor, onCreateMember, onCreateClient }) {
  const [openModal, setOpenModal] = useState(null) // 'member' | 'client' | null

  const cards = [
    // Cadastro de membro é ação de gestor — só aparece para o gestor
    isGestor && {
      key: 'member',
      icon: <IconUserCheck size={22} />,
      title: 'Convidar Membro da Equipe',
      subtitle: 'Gere um convite; a pessoa define a própria senha ao ativar a conta.',
      action: '+ Novo Convite',
    },
    // Cadastro de cliente também é ação de gestor — mesma regra do convite
    isGestor && {
      key: 'client',
      icon: <IconBuilding size={22} />,
      title: 'Cadastrar Cliente',
      subtitle: 'Cadastre novas empresas ou clientes para vincular a tarefas e projetos.',
      action: '+ Novo Cliente',
    },
  ].filter(Boolean)

  // O modal continua aberto depois de salvar: é nele que o link de ativação
  // aparece para ser copiado (o servidor não guarda o token puro).
  const handleSaveMember = (member) => onCreateMember(member)

  const handleSaveClient = async (client) => {
    await onCreateClient(client)
    setOpenModal(null)
  }

  return (
    <div className="registry-view">
      <div className="registry-grid">
        {cards.map((c) => (
          <div className="registry-card" key={c.key}>
            <div className="registry-card-icon">{c.icon}</div>
            <div className="registry-card-body">
              <h3>{c.title}</h3>
              <p>{c.subtitle}</p>
            </div>
            <button className="registry-card-btn" onClick={() => setOpenModal(c.key)}>
              <IconPlus size={15} />
              <span>{c.action.replace('+ ', '')}</span>
            </button>
          </div>
        ))}
      </div>

      {openModal === 'member' && (
        <TeamMemberModal onCancel={() => setOpenModal(null)} onSave={handleSaveMember} />
      )}
      {openModal === 'client' && (
        <ClientModal onCancel={() => setOpenModal(null)} onSave={handleSaveClient} />
      )}
    </div>
  )
}
