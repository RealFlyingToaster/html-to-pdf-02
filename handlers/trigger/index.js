/**
 * Trigger lambda function:
 * - respond on API Gateway
 * - accept event data
 * - create a job token
 * - trigger a work lambda to do the work
 * - return the job token
 */
const { v4: uuidv4 } = require('uuid'),
    AWS = require('aws-sdk');

// set the region
AWS.config.update({ region: process.env.REGION });

let response,
    sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

exports.lambdaHandler = async (event, context) => {
    try {
        const sqsQueueUrl = process.env.SQS_QUEUE_IN,
            s3Bucket = process.env.SCRATCH_BUCKET,
            jobToken = uuidv4();

        console.log('trigger: ' + JSON.stringify(event));
        console.log('trigger: posting ' + jobToken + ' to ' + sqsQueueUrl);

        let params = {
            MessageAttributes: {
                "Job": {
                    DataType: "String",
                    StringValue: jobToken
                }
            },
            MessageBody: event.body || "{}",
            QueueUrl: sqsQueueUrl
        };

        await sqs.sendMessage(params).promise()
            .then((data) => {
                console.log('trigger: succcess: ' + data.MessageId);
                response = {
                    'statusCode': 200,
                    'body': JSON.stringify({
                        // event: event,
                        job: jobToken,
                        //defaultBucket: s3Bucket,
                        key: `jobs/${jobToken}/html.pdf`,
                        queue: process.env.SQS_QUEUE_OUT
                    })
                };
            }).catch((err) => {
                console.error('trigger: ' + err);
                throw (err);
            });
    } catch (err) {
        console.log(err);
        response = {
            'statusCode': 500,
            'body': JSON.stringify({
                error: err
            })
        }
    }

    return response;
};
