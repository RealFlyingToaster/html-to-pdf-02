//
// 1) Poll SQS Queue
// 2) When message received...
// 3) Parse its payload to find bucket/key created
// 4) Download the file to /tmp
// 5) Fire an event

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

    eventName(jobId) {
        return `complete.${jobId}`;
    }

    async downloadOne(bucket, key) {
        console.log(`Downloading Bucket: ${bucket}; Key: ${key}`);
        let params = { Key: key, Bucket: bucket },
            fileHandle,
            filePath = this.localPath + '/' + key.replace(/\//g, '-'),
            successPath = '';
        await s3.getObject(params).promise()
            .then(async (data) => {
                try {
                    fileHandle = await fsPromises.open(filePath, 'w');
                    await fileHandle.writeFile(data.Body);
                    console.info('...done');
                    successPath = filePath; // only set when whole operation is successful
                } finally {
                    if (fileHandle) {
                        await fileHandle.close();
                    }
                    this.clean();
                }
            }).catch((err) => {
                console.error('Error in s3.getObject: ' + err);
            });
        return successPath;
    }

    async handleMessage(message) {
        console.log('Message: ' + JSON.stringify(message));
        try {
            let body = JSON.parse(message.Body),
                bucket = body.bucket,
                key = body.key,
                job = body.job,
                eventName = this.eventName(job),
                filePath = await this.downloadOne(bucket, key);
            // trigger event
            this.emit(eventName, { job: job, path: filePath });
            console.log(eventName);
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
