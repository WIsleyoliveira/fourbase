import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyDraft, setDraftField, validateDraft, buildTaskFields, countAdvanced,
} from '../src/newTaskForm.js'

const base = { priority: 'Média', columnKey: 'todo', assignedTo: 'me' }
const draft = (o = {}) => ({ ...emptyDraft({ assignedTo: 'me', columnKey: 'todo' }), title: 'Tarefa', ...o })

test('rascunho vazio usa os padrões recebidos', () => {
  const d = emptyDraft({ assignedTo: 'u1', columnKey: 'doing' })
  assert.equal(d.title, '')
  assert.equal(d.priority, 'Média')
  assert.equal(d.columnKey, 'doing')
  assert.equal(d.assignedTo, 'u1')
  assert.deepEqual([d.tags, d.mentioned, d.attachments], [[], [], []])
})

test('apagar o prazo limpa data final e horários; apagar o horário limpa o horário final', () => {
  let d = draft({ dueDate: '2026-10-10', dueDateEnd: '2026-10-12', dueTime: '09:00', dueTimeEnd: '10:00' })
  const noTime = setDraftField(d, 'dueTime', '')
  assert.equal(noTime.dueTimeEnd, '')
  assert.equal(noTime.dueDateEnd, '2026-10-12')
  d = setDraftField(d, 'dueDate', '')
  assert.deepEqual([d.dueDateEnd, d.dueTime, d.dueTimeEnd], ['', '', ''])
})

test('mudar o início para depois da data final empurra a data final', () => {
  const d = setDraftField(draft({ dueDate: '2026-10-10', dueDateEnd: '2026-10-11' }), 'dueDate', '2026-10-20')
  assert.equal(d.dueDate, '2026-10-20')
  assert.equal(d.dueDateEnd, '2026-10-20')
  const keep = setDraftField(draft({ dueDate: '2026-10-10', dueDateEnd: '2026-10-30' }), 'dueDate', '2026-10-12')
  assert.equal(keep.dueDateEnd, '2026-10-30')
})

test('setDraftField não altera o rascunho original', () => {
  const d = Object.freeze(draft({ dueDate: '2026-10-10' }))
  const next = setDraftField(d, 'priority', 'Alta')
  assert.equal(next.priority, 'Alta')
  assert.equal(d.priority, 'Média')
})

test('validação: título, data final antes do início, horário final órfão e invertido', () => {
  assert.equal(validateDraft(draft({ title: '   ' })), 'Informe o título da tarefa.')
  assert.equal(validateDraft(draft()), null)
  assert.equal(
    validateDraft(draft({ dueDate: '2026-10-10', dueDateEnd: '2026-10-09' })),
    'A data final não pode ser antes da data de início.',
  )
  assert.equal(
    validateDraft(draft({ dueDate: '2026-10-10', dueTimeEnd: '10:00' })),
    'Defina o horário de início antes do horário final.',
  )
  assert.equal(
    validateDraft(draft({ dueDate: '2026-10-10', dueTime: '10:00', dueTimeEnd: '09:00' })),
    'O horário final não pode ser antes do horário de início.',
  )
  // em intervalo de vários dias, horário final "menor" é legítimo (22:00 → 06:00 do dia seguinte)
  assert.equal(
    validateDraft(draft({ dueDate: '2026-10-10', dueDateEnd: '2026-10-11', dueTime: '22:00', dueTimeEnd: '06:00' })),
    null,
  )
})

test('campos enviados: mesmo formato do modal de tarefa', () => {
  const fields = buildTaskFields(
    draft({
      title: '  Fechar proposta  ', description: '  detalhes  ', priority: 'Alta', columnKey: 'doing',
      dueDate: '2026-10-10', dueDateEnd: '2026-10-12', dueTime: '09:00', dueTimeEnd: '10:30',
      assignedTo: 'u2', clientId: 'c1', tags: ['Design'], mentioned: ['u3'], attachments: ['https://x/y.png'],
    }),
    { isGestor: true },
  )
  assert.deepEqual(fields, {
    title: 'Fechar proposta', description: 'detalhes', priority: 'Alta', column_key: 'doing',
    due_date: '2026-10-10', due_date_end: '2026-10-12', due_time: '09:00', due_time_end: '10:30',
    assigned_to: 'u2', client_id: 'c1', tags: ['Design'], mentioned_users: ['u3'], attachments: ['https://x/y.png'],
  })
})

test('campos enviados: sem prazo não vai data final nem horário; sem horário não vai horário final', () => {
  const noDate = buildTaskFields(draft({ dueDateEnd: '2026-10-12', dueTime: '09:00', dueTimeEnd: '10:00' }), { isGestor: true })
  assert.deepEqual([noDate.due_date, noDate.due_date_end, noDate.due_time, noDate.due_time_end], [null, null, null, null])
  const noTime = buildTaskFields(draft({ dueDate: '2026-10-10', dueTimeEnd: '10:00' }), { isGestor: true })
  assert.deepEqual([noTime.due_time, noTime.due_time_end], [null, null])
})

test('responsável só vai para o servidor quando quem cria é gestor; cliente do quadro prevalece', () => {
  assert.equal(buildTaskFields(draft({ assignedTo: 'u2' }), { isGestor: false }).assigned_to, undefined)
  assert.equal(buildTaskFields(draft({ assignedTo: 'u2' }), { isGestor: true }).assigned_to, 'u2')
  assert.equal(buildTaskFields(draft({ clientId: 'c1' }), { isGestor: true }).client_id, 'c1')
  assert.equal(buildTaskFields(draft({ clientId: 'c1' }), { isGestor: true, forcedClientId: 'c9' }).client_id, 'c9')
  assert.equal(buildTaskFields(draft(), { isGestor: true }).client_id, null)
})

test('contador de opções avançadas preenchidas (só o que difere do padrão)', () => {
  assert.equal(countAdvanced(draft(), base), 0)
  assert.equal(countAdvanced(draft({ priority: 'Alta', description: 'x', tags: ['a'], mentioned: ['u'] }), base), 4)
  assert.equal(countAdvanced(draft({ dueDate: '2026-10-10', dueTime: '09:00', attachments: ['u'], clientId: 'c' }), base), 4)
  assert.equal(countAdvanced(draft({ columnKey: 'doing', assignedTo: 'u2' }), base), 2)
  assert.equal(countAdvanced(draft({ title: 'só título' }), base), 0)
})
