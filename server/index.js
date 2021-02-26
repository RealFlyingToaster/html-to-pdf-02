// Run this process on the local server to act as a manager for 
const { ApplicationAutoScaling } = require('aws-sdk');
const express = require('express'),
    Downloader = require('./lib/downloader'),
    DownloadJob = require('./lib/download-job');
const app = express();
app.use(express.json());
const port = 3020;

const downloader = new Downloader({
    queueUrl: 'https://sqs.us-west-1.amazonaws.com/366821136411/html-to-pdf-02-SQSQueueOut-RR8Z4XSUFDI',
    expires: 20 * 60 // 20 minute exipry on generated documents
});

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.post('/', async (req, res) => {
    // repost the payload to the trigger API and wait for the result
    console.log('Post job received: ' + JSON.stringify(req.body));
    let downloadJob = new DownloadJob({
        triggerDomain: 'https://pdfshot.dev.db101.org',
        payload: req.body
    });
    // parse the reply for the jobId
    let jobId = await downloadJob.run(),
        eventName = downloader.eventName(jobId);

    console.log('post done: ' + jobId);

    // hang a custom event listener on the downloader
    downloader.once(eventName, (args) => {
        // wait for the download
        console.log(`downloader fired ${eventName}: ${args}`);
        // return the disk location of the downloaded file

        res.send(args.path);
    });


})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})