import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_FILE_MB, extOf, isImageName, fileNameFromUrl, validateFile, safeFileName, storagePathFor, fileKind,
} from '../src/taskFiles.js'

const file = (name, size = 1000) => ({ name, size })

test('qualquer tipo comum de arquivo é aceito', () => {
  for (const name of ['foto.png', 'contrato.pdf', 'planilha.xlsx', 'apresentacao.pptx', 'audio.mp3', 'video.mp4', 'pacote.zip', 'notas.txt', 'arquivo-sem-extensao']) {
    assert.equal(validateFile(file(name)), null, name)
  }
})

test('executáveis, scripts e páginas são recusados (qualquer caixa)', () => {
  for (const name of ['setup.exe', 'run.BAT', 'script.js', 'pagina.html', 'desenho.SVG', 'instala.msi', 'x.ps1']) {
    assert.match(validateFile(file(name)), /não é permitido/, name)
  }
})

test('vazio e acima do limite são recusados com mensagem clara', () => {
  assert.match(validateFile(file('a.pdf', 0)), /vazio/)
  assert.equal(validateFile(file('a.pdf', MAX_FILE_MB * 1024 * 1024)), null)
  assert.match(validateFile(file('grande.pdf', MAX_FILE_MB * 1024 * 1024 + 1)), /passa de 25 MB/)
})

test('nome seguro: sem acento/espaço/símbolo, extensão preservada', () => {
  assert.equal(safeFileName('Relatório final (v2).PDF'), 'Relatorio_final_v2.pdf')
  assert.equal(safeFileName('../../etc/passwd'), 'passwd')
  assert.equal(safeFileName('???.png'), 'arquivo.png')
  assert.equal(safeFileName('a'.repeat(200) + '.zip').length <= 90, true)
})

test('caminho do Storage guarda o nome original no último trecho e o nome volta da URL', () => {
  const path = storagePathFor('t1', 'Proposta comercial.pdf', '1699999-abc')
  assert.equal(path, 'tasks/t1/1699999-abc/Proposta_comercial.pdf')
  const url = `https://x.supabase.co/storage/v1/object/public/bucket/${path}`
  assert.equal(fileNameFromUrl(url), 'Proposta_comercial.pdf')
  assert.equal(fileNameFromUrl(url + '?t=1'), 'Proposta_comercial.pdf')
  assert.equal(fileNameFromUrl('https://x/%C3%A1.png'), 'á.png')
})

test('imagem x outros arquivos e ícone', () => {
  assert.equal(extOf('A.B.JPG'), 'jpg')
  assert.equal(isImageName('foto.WEBP'), true)
  assert.equal(isImageName('contrato.pdf'), false)
  assert.deepEqual(['a.pdf', 'b.xlsx', 'c.pptx', 'd.docx', 'e.zip'].map(fileKind), ['pdf', 'sheet', 'slides', 'doc', 'doc'])
})
