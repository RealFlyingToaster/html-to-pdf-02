// Run this process on the development VM
// to act as a local replacement for Phantom
const express = require('express'),
    pdfLocal = require('./lib/pdf-local'),
    { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
const port = 3020;

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.post('/', async (req, res) => {
    // repost the payload to the trigger API and wait for the result
    let data = req.body;
    data.path = `/tmp/${uuidv4()}.pdf`;
    console.log('Post job received: ' + JSON.stringify(data));
    let filePath = await pdfLocal.pdf(data.url, data);

    console.log('post done: ' + filePath);

    res.send(filePath);
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})