const express = require('express')
const bodyParser = require('body-parser')
const serveIndex = require('serve-index')
const AsyncLock = require('async-lock')
const fs = require('fs')
const app = express()
const port = 3000
const wsPort = 4000

// Use the start time as the offset, add counter to this offset.
// As our load is very small, when the server is restarted,
// hopefully this would prevent the id from colliding.
const startTime = new Date().valueOf()
let counter = 0

app.use(bodyParser.urlencoded({
    extended: true
}))
app.use(bodyParser.json())
app.use('/uploaded', express.static('uploaded'), serveIndex('uploaded'))
app.use('/resources', express.static('resources'))

app.get('/', (req, res) => res.sendFile(__dirname + '/upload.html'))
app.post('/upload', (req, res) => {
    const time = new Date().valueOf()
    const id = startTime + counter++
    console.log(`Upload from ip ${req.ip} at time ${time} with id ${id}`)
    if (!('content' in req.body)) {
        res.sendStatus(400)
        console.log('Bad Request!')
        return
    }
    fs.writeFile(__dirname + `/uploaded/${id}.html`, req.body.content, err => {
        if (err) {
            res.sendStatus(500)
            console.error(`File ${id}.html failed to save!`)
            console.error(err)
        }
        else {
            res.sendStatus(200)
            console.log(`File ${id}.html saved successfully!`)
        }
    })
})

const wss = new (require('ws').Server)({ port: wsPort, clientTracking: true },
    () => console.log(`WS Server listening on port ${wsPort}`))


let questions = JSON.parse(fs.readFileSync(__dirname + '/uploaded/db.json', { encoding: 'utf-8' }))
let lock = new AsyncLock()
let timer = null

const broadcast = data => {
    const msg = JSON.stringify(data)
    wss.clients.forEach(v => v.send(msg))
}

const savedb = () => {
    timer = null
    fs.copyFile(__dirname + '/uploaded/db.json', __dirname + '/uploaded/db_old.json', e => {
        if (e) {
            console.error('Failed to make database backup!')
            if (timer == null)
                timer = setTimeout(savedb, 10000)
            return
        }
        lock.acquire('q', done => {
            fs.writeFile(__dirname + '/uploaded/db.json', JSON.stringify(questions), e => {
                done()
                if (e) {
                    console.error('Failed to save database!')
                    if (timer == null)
                        timer = setTimeout(savedb, 10000)
                    return
                }
                console.log('Database saved!')
            })
        })
    })
}

const addQuestion = q => {
    lock.acquire('q', done => {
        for (let p of questions) {
            if (p[0] == q) {
                done()
                return
            }
        }
        const index = questions.length
        questions.push([q])
        if (timer == null)
            timer = setTimeout(savedb, 10000)
        done()
        // Ordering may be messed up due to concurrency in the clients
        broadcast({
            id: 'add',
            index: index,
            content: q
        })
    })
}

const addAns = (index, ans) => {
    if (index >= questions.length)
        return
    lock.acquire('q', done => {
        questions[index].push(ans)
        done()
        if (timer == null)
            timer = setTimeout(savedb, 10000)
        broadcast({
            id: 'ans',
            index: index,
            content: ans
        })
    })
}

wss.on('connection', (ws, req) => {
    ws.send(JSON.stringify({ id: 'init', content: questions }))
    ws.on('message', function (msg) {
        try {
            const data = JSON.parse(msg)
            switch (data.id) {
                case 'ping':
                    this.send(JSON.stringify({ 'id': 'pong' }))
                    break
                case 'add':
                    addQuestion(data.content)
                    break
                case 'ans':
                    addAns(parseInt(data.index), data.content)
                    break
            }
        } catch (e) {
            console.log(`Invalid WebSocket Msg JSON, Error: ${e}`)
        }
    })
})

app.listen(port, () => console.log(`HTTP Server listening on port ${port}.`))
