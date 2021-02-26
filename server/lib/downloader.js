//
// 1) Poll SQS Queue
// 2) When message received...
// 3) Parse its payload to find bucket/key created
// 4) Download the file to /tmp
// 5) Fire an event

const { exception } = require('console');
const EventEmitter = require('events'),
    AWS = require('aws-sdk'),
    { Consumer } = require('sqs-consumer'),
    fsPromises = require('fs').promises,
    _ = require('lodash'),
    findRemove = require('find-remove');

AWS.config.update({
    region: 'us-west-1'
});

const s3 = new AWS.S3();

class Downloader extends EventEmitter {
    async clean() {
        // clean the temporary directory if told to.
        if (this.expires && this.expires > 0) {
            try {
                findRemove(this.localPath, { extensions: ['.pdf'], age: { seconds: this.expires }, maxLevel: 1 });
            } catch (ex) {
                console.error('Exception on clean: ' + ex.message);
            }
        }
    }

    async downloadOne(bucket, key) {
        console.log(`Downloading Bucket: ${bucket}; Key: ${key}`);
        let params = { Key: key, Bucket: bucket };
        await s3.getObject(params).promise()
            .then(async (data) => {
                let fileHandle,
                    filePath = this.localPath + '/' + key.replace(/\//g, '-');
                try {
                    fileHandle = await fsPromises.open(filePath, 'w');
                    await fileHandle.writeFile(data.Body);
                    console.info('...done');
                } finally {
                    if (fileHandle) {
                        await fileHandle.close();
                    }
                    this.clean();
                }
            });
    }

    async handleMessage(message) {
        console.log('Message: ' + JSON.stringify(message));
        try {
            let body = JSON.parse(message.Body),
                bucket = body.bucket,
                key = body.key,
                job = body.job;
            await this.downloadOne(bucket, key);
            // trigger event
            this.emit(`complete.${job}`);
            console.log(`complete.${job}`);
        } catch (ex) {
            console.error(ex.message);
            throw new Error('Error parsing message: ' + ex.message);
        }
    }

    constructor(params) {
        super();
        this.queueUrl = params.queueUrl;
        this.localPath = params.localPath || '/tmp';
        this.expires = params.expires || 0;
        this.consumer = Consumer.create({
            queueUrl: this.queueUrl,
            handleMessage: _.bind(this.handleMessage, this)
        });
        this.consumer.on('error', (err) => {
            console.error(err.message);
        });

        this.consumer.on('processing_error', (err) => {
            console.error('Processing error: ' + err.message);
        });

        this.consumer.on('timeout_error', (err) => {
            console.error('Timeout error: ' + err.message);
        });

        this.consumer.start();
    }

    stop() {
        this.consumer.stop();
    }
}

module.exports = Downloader;
