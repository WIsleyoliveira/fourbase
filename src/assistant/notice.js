// Aviso de privacidade da tela Assistente (texto do Conselho: Guardian + Advocate).
// O gestor autoriza ESTA versão ao criar a chave; o servidor recusa outra (api/_lib/assistant.js).
// Mudou o texto de forma relevante? Suba a versão aqui e lá — tests/assistant-front.test.js confere.
export const NOTICE_VERSION = '2026-11-01'

export const NOTICE = {
  title: 'O que o ChatGPT vai ver',
  // camada 1: sempre visível
  summary: [
    'Seu ChatGPT vai ver as suas tarefas (título, descrição, data, horário e cliente) e os nomes de todos os clientes da empresa, e poderá criar tarefas para você.',
    'Esses dados vão para a OpenAI, empresa do ChatGPT, com servidores fora do Brasil.',
    'O que entra numa conversa fica no histórico do ChatGPT: o fourbase não consegue apagar lá.',
    'Evite CPF, senhas e dados de saúde nas descrições das tarefas.',
  ],
  // camada 2: "Ver detalhes"
  details: [
    { title: 'O que ele não vê', text: 'Tarefas da equipe, e-mails e telefones de clientes, notas, anexos e membros da empresa.' },
    { title: 'O que ele pode fazer', text: 'Criar tarefas só para você, sempre mostrando a lista antes. As tarefas entram na primeira coluna com a etiqueta "ChatGPT". Ele não edita nem apaga tarefas que já existem. Você pode desfazer um pedido em até 48 horas, desde que ninguém tenha mexido nas tarefas.' },
    { title: 'Sua conta do ChatGPT', text: 'A conversa segue as regras da sua conta na OpenAI. Se não quiser que suas conversas sejam usadas para treinar os modelos, desligue essa opção nos Controles de dados do ChatGPT. Para apagar o que já foi visto, apague a conversa no próprio ChatGPT.' },
    { title: 'Sua chave', text: 'Ela vale por 1 ano e só funciona para agenda e clientes. Cole a chave só no campo "Chave de API" do assistente que você criou, nunca na conversa. Deixe o assistente como "Somente eu".' },
    { title: 'Desligar', text: 'A qualquer momento, em "Desconectar", nesta tela. O acesso para na hora.' },
  ],
  consent: 'Ao continuar, você confirma que é responsável por esta empresa no fourbase e autoriza o envio desses dados ao seu ChatGPT.',
}
