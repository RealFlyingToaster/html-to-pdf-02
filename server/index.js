const express = require('express'),
  Downloader = require('./lib/downloader');
const app = express();
const port = 3020;

const downloader = new Downloader({
  queueUrl: 'https://sqs.us-west-1.amazonaws.com/366821136411/html-to-pdf-02-SQSQueueOut-RR8Z4XSUFDI',
  expires: 20 * 60 // 20 minute exipry
});

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})