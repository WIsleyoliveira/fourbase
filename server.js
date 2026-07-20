import 'dotenv/config'
import app from './api/index.js'

const port = process.env.API_PORT || 3001
app.listen(port, () => {
  console.log(`fourbase API rodando em http://localhost:${port}`)
})
