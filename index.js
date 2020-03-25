const express = require('express')
const bodyParser = require('body-parser')
const serveIndex = require('serve-index')
const fs = require('fs')
const ws = require('ws')
const app = express()
const port = 3000

// Use the start time as the offset, add counter to this offset.
// As our load is very small, when the server is restarted,
// hopefully this would prevent the id from colliding.
const startTime = new Date().valueOf();
let counter = 0;

app.use(bodyParser.urlencoded({
    extended: true
}))
app.use(bodyParser.json())
app.use('/uploaded', express.static('uploaded'), serveIndex('uploaded'))

app.get('/', (req, res) => res.sendFile(__dirname + '/upload.html'))
app.post('/upload', (req, res) => {
    const time = new Date().valueOf()
    const id = startTime + counter++;
    console.log(`Upload from ip ${req.ip} at time ${time} with id ${id}`)
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

app.listen(port, () => console.log(`Listening on port ${port}.`))
