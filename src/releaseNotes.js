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
    version: '1.4.0',
    date: '2026-11-10',
    title: 'Equipe: veja o Kanban de cada pessoa e sinalize tarefas',
    intro: 'Para o gestor acompanhar a equipe de perto e cobrar com educação:',
    items: [
      {
        kind: 'Novo',
        icon: 'IconKanban',
        title: 'Kanban de cada pessoa, numa janela',
        text: 'Na aba Equipe, clique em “Ver Kanban” no cartão de qualquer pessoa para ver só as tarefas dela, por coluna, com a barra de progresso.',
        points: [
          'Vê quantas tarefas ela já concluiu e o que está atrasado',
          'É só consulta: nada muda no quadro da pessoa',
        ],
        cta: { label: 'Abrir a Equipe', path: '/equipe' },
      },
      {
        kind: 'Novo',
        icon: 'IconBell',
        title: 'Sininho: sinalize uma tarefa que precisa ser feita',
        text: 'Toque no sino ao lado da tarefa e, se quiser, deixe um recado. A pessoa recebe um aviso no sino do fourbase e um e-mail em tom formal.',
        points: [
          'O aviso diz: “@gestor está sinalizando a você a tarefa …, que precisa ser realizada”',
          'Cada tarefa só pode ser sinalizada de novo depois de 10 minutos',
          'Só tarefas em aberto e da própria pessoa; quem desligou os e-mails recebe só o aviso no sino',
        ],
        cta: { label: 'Abrir a Equipe', path: '/equipe' },
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-11-06',
    title: 'Calendário no celular e tela inicial à sua escolha',
    intro: 'Deixamos o fourbase mais confortável no celular e mais do seu jeito:',
    items: [
      {
        kind: 'Novo',
        icon: 'IconUser',
        title: 'Escolha a sua tela inicial',
        text: 'Gosta de começar pelo Calendário? Agora o fourbase abre direto na tela que você preferir.',
        points: [
          'Vá em Meu Perfil → Tela inicial e escolha: Painel, Kanban, Calendário, Notas, Clientes e outras',
          'A escolha vale para você, neste navegador: cada pessoa tem a sua',
          'Se você abrir um link direto (por exemplo, de uma notificação), ele continua abrindo onde o link diz',
        ],
        cta: { label: 'Escolher minha tela inicial', path: '/perfil' },
      },
      {
        kind: 'Melhoria',
        icon: 'IconCalendar',
        title: 'Calendário feito para o celular',
        text: 'O mês agora tem quadrados grandes, como no calendário do iPhone, e mostra o nome das tarefas dentro de cada dia.',
        points: [
          'Toque num dia para ver as tarefas dele por inteiro: horário, descrição, status, prioridade, cliente e responsável',
          'Toque numa tarefa para abrir os detalhes e use o círculo para concluir',
          'O botão “+ Nova” cria uma tarefa já naquele dia',
        ],
        cta: { label: 'Abrir o Calendário', path: '/calendario' },
      },
      {
        kind: 'Melhoria',
        icon: 'IconKanban',
        title: 'Mais fácil de usar com o dedo',
        text: 'Ajustamos botões, campos e telas para o celular.',
        points: [
          'Botões pequenos ficaram mais fáceis de tocar',
          'Ao tocar num campo, a tela não dá mais zoom no iPhone',
          'Notas não rola mais para o lado, e a tarefa aberta ocupa a tela toda',
        ],
        cta: null,
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-26',
    title: 'Anexos de qualquer tipo e colunas do Kanban editáveis',
    intro: 'Duas melhorias para o dia a dia do seu quadro:',
    items: [
      {
        kind: 'Novo',
        icon: 'IconPaperclip',
        title: 'Anexe qualquer tipo de arquivo',
        text: 'Além de imagens, agora você anexa PDF, planilhas, documentos, apresentações, arquivos compactados e muito mais às tarefas.',
        points: [
          'Arraste os arquivos ou clique em “Adicionar arquivo ou imagem”',
          'Imagens aparecem como miniaturas; os outros arquivos numa lista, com opção de abrir, baixar e excluir',
          'Até 25 MB por arquivo (executáveis e páginas da web não são aceitos, por segurança)',
        ],
        cta: { label: 'Abrir o Kanban', path: '/kanban' },
      },
      {
        kind: 'Novo',
        icon: 'IconKanban',
        title: 'Edite as colunas do Kanban',
        text: 'Quem é gestor agora personaliza o quadro: passe o mouse no título de uma coluna e clique no lápis.',
        points: [
          'Renomeie, troque a cor e mova a coluna para a esquerda ou para a direita',
          'Exclua uma coluna escolhendo para onde as tarefas dela vão',
          'A coluna “Concluído” continua fixa, sempre por último',
        ],
        cta: { label: 'Abrir o Kanban', path: '/kanban' },
      },
      {
        kind: 'Melhoria',
        icon: 'IconDashboard',
        title: 'Painel e Equipe acompanham suas colunas',
        text: 'Os contadores e o gráfico de progresso passam a usar o nome e a cor das colunas que você definiu.',
        points: [],
        cta: { label: 'Ver o painel', path: '/painel' },
      },
    ],
  },
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
