// Abertura da tela Assistente (Modo 1): o que é, como funciona e o que precisa. Texto do Conselho.
export default function AssistantIntro({ status }) {
  return (
    <section className="panel asst-intro">
      <h2>Monte sua agenda conversando com o ChatGPT</h2>
      <p>Você conta o que precisa fazer — por texto, voz ou colando um e-mail — e o ChatGPT organiza as tarefas. Antes de criar qualquer coisa, ele mostra a lista e espera o seu OK.</p>
      <ol className="asst-how">
        <li><strong>Você pede</strong><span>"Coloca reunião com a Padaria Sol na quinta às 10h."</span></li>
        <li><strong>Ele mostra a lista</strong><span>e pergunta se está tudo certo.</span></li>
        <li><strong>Você confirma</strong><span>as tarefas aparecem no seu Kanban e Calendário com a etiqueta ChatGPT.</span></li>
      </ol>
      <div className="asst-before">
        <strong>Antes de começar</strong>
        <ul>
          <li>Você precisa de um plano do <strong>ChatGPT que permita criar apps</strong> (o "modo desenvolvedor"). <details className="asst-inline-details"><summary>Não sei se o meu plano permite</summary>O passo 2 mostra onde conferir. Se a opção não existir na sua conta, o plano atual não permite; você continua usando o fourbase normalmente e pode voltar aqui quando quiser.</details></li>
          <li>Leva uns 5 minutos. Faça pelo <strong>computador</strong> e deixe esta tela aberta ao lado do ChatGPT.</li>
        </ul>
        <p className="asst-mobile-hint">Criar o app funciona melhor no computador. Depois de pronto, você usa no app do ChatGPT no celular normalmente.</p>
      </div>
      {status?.state === 'off' && <p className="asst-callout">Seu ChatGPT está desconectado. Siga os passos para conectar de novo.</p>}
    </section>
  )
}
