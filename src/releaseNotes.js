// Catálogo das novidades mostradas ao usuário ("O que há de novo"). A mais nova vem
// primeiro. Para publicar uma versão nova: acrescente um item NO TOPO de RELEASES
// (e o mesmo texto em CHANGELOG.md) e suba a "version" do package.json — quem ainda
// não viu essa versão verá o aviso uma vez ao entrar.
//
// Escreva do ponto de vista de quem usa: o que muda para a pessoa, sem jargão.
// `kind`: 'Novo' | 'Melhoria' | 'Correção'. `icon`: nome de um ícone de src/icons.jsx.
// `cta` (opcional): leva direto à tela ({ label, path }).

export const RELEASES = [
  {
    version: '1.1.0',
    date: '2026-10-05',
    title: 'Tema noite, notificações, novo Painel, Kanban e Calendário',
    intro: 'Reunimos as melhorias dessa rodada. Veja o que mudou:',
    items: [
      {
        kind: 'Novo',
        icon: 'IconMoon',
        title: 'Tema dia e tema noite',
        text: 'Prefere um visual mais escuro? Agora você escolhe entre o tema dia e o tema noite, em todas as telas.',
        points: [
          'O botão de lua/sol fica no topo da página (no celular, no cabeçalho)',
          'Sua escolha fica salva; sem escolha, usamos o tema do seu dispositivo',
        ],
      },
      {
        kind: 'Novo',
        icon: 'IconBell',
        title: 'Sino de notificações',
        text: 'Receba um aviso no sino quando alguém mencionar você ou atribuir uma tarefa a você. Também avisamos quando um prazo está chegando ou já passou.',
        points: [
          'Clique no aviso para abrir a tarefa na hora',
          'Em breve: o mesmo aviso também por e-mail (você poderá desligar em Meu Perfil)',
        ],
      },
      {
        kind: 'Novo',
        icon: 'IconDashboard',
        title: 'Painel principal renovado',
        text: 'Seu ponto de partida ficou mais completo e organizado, com tudo à mão para começar o dia.',
        points: [
          'Gráfico de rosca com a proporção de tarefas a fazer, em progresso e concluídas',
          'Conclua tarefas direto na lista de próximos prazos — as atrasadas ficam em destaque',
          'Agenda de hoje com o que está marcado para o dia',
          'Atalhos com “+” para anotar uma nota rápida ou criar uma tarefa sem sair do painel',
          '“Criar Tarefa” e “Recarregar dados” agora ficam no topo da página',
        ],
        cta: { label: 'Ver o painel', path: '/painel' },
      },
      {
        kind: 'Novo',
        icon: 'IconPlus',
        title: 'Opções avançadas ao criar tarefas',
        text: 'No Kanban, o formulário de nova tarefa agora aceita tudo de uma vez, sem precisar abrir a tarefa depois.',
        points: [
          'Status, responsável, cliente, prioridade e etiquetas',
          'Prazo, data final e horário de início e fim',
          'Pessoas mencionadas, descrição e imagens',
        ],
        cta: { label: 'Abrir o Kanban', path: '/kanban' },
      },
      {
        kind: 'Novo',
        icon: 'IconFilter',
        title: 'Kanban com busca e filtros',
        text: 'Encontre qualquer tarefa rápido: busque por título, descrição ou etiqueta e combine filtros de responsável, prioridade, prazo, cliente e mencionados.',
        points: [
          'Ordene por prioridade, prazo, mais recentes ou A–Z',
          'O resumo mostra quantas tarefas estão atrasadas e para hoje',
          'Visual do quadro renovado, mais limpo e legível',
        ],
        cta: { label: 'Experimentar', path: '/kanban' },
      },
      {
        kind: 'Melhoria',
        icon: 'IconCalendar',
        title: 'Tarefas de vários dias numa faixa só',
        text: 'No Calendário, uma tarefa que dura vários dias agora aparece como uma única barra contínua, em vez de se repetir em cada dia.',
        points: [
          'A hora de início aparece antes do título',
          'Dias cheios mostram “+N mais” e abrem a lista completa',
          'Passe o mouse para ver título, responsável e prazo',
        ],
        cta: { label: 'Abrir o Calendário', path: '/calendario' },
      },
      {
        kind: 'Novo',
        icon: 'IconClock',
        title: 'Crie tarefas clicando no dia',
        text: 'Clique em qualquer dia do Calendário, digite o título e pronto — a data já vem preenchida. Precisa de mais campos? “Mais opções” abre o formulário completo.',
        points: [],
        cta: { label: 'Abrir o Calendário', path: '/calendario' },
      },
      {
        kind: 'Novo',
        icon: 'IconList',
        title: 'Pendências: atrasadas e sem data',
        text: 'O botão Pendências abre uma gaveta com as tarefas em atraso e as sem data. Arraste uma para um dia do calendário ou use “Hoje” para reagendar.',
        points: [],
        cta: { label: 'Abrir o Calendário', path: '/calendario' },
      },
      {
        kind: 'Novo',
        icon: 'IconCalendar',
        title: 'Mini-calendário e filtros laterais',
        text: 'Pule para qualquer dia ou mês pelo mini-calendário e ligue ou desligue status, responsáveis e etiquetas com caixas de marcar — com a contagem de tarefas de cada um.',
        points: [],
        cta: { label: 'Abrir o Calendário', path: '/calendario' },
      },
      {
        kind: 'Melhoria',
        icon: 'IconShield',
        title: 'Mais rápido e mais seguro',
        text: 'Reforçamos a proteção dos seus dados e deixamos as telas mais ágeis: as mudanças aparecem na hora e voltam sozinhas se algo der errado.',
        points: [],
      },
    ],
  },
]

export const LATEST_VERSION = RELEASES[0].version
