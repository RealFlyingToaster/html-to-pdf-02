const renderer = require('lib/pdf-render.js');

let response;

// establish local font library
process.env.FONTCONFIG_PATH='/var/task/fonts';

/**
 *
 * Async SQS event handler
 * Returns: Promise
 * 
 */
exports.lambdaHandler = async (event, context) => {

    console.log('html-to-pdf handler received event: ' + JSON.stringify(event, null, 4));
    // expects event: { Records: [] }
    let promises = [],
        bucketName = process.env.SCRATCH_BUCKET,
        region = process.env.REGION;

    // loop over event records and build an array of promises
    event.Records.forEach(
        (record) => {
            let jobId = (record.messageAttributes && record.messageAttributes.Job && record.messageAttributes.Job.stringValue ? record.messageAttributes.Job.stringValue : 'xxxx'),
                requestData = JSON.parse(record.body || '{}');

            promises.push(new Promise((resolve, reject) => {
                bucketName = requestData.bucketName || bucketName;

                console.log('html-to-pdf record: ' + JSON.stringify(record));
                console.log('Job: ' + jobId);
                console.log('request data: ' + JSON.stringify(requestData));
                console.log('scratch bucket' + bucketName);
                console.log('renderer: ' + typeof (renderer));
                try {
                    renderer.pdf(requestData.url, {
                        bucketName: bucketName,
                        region: region,
                        key: `jobs/${jobId}/html.pdf`,
                        jobId: jobId,
                        headers: requestData.headers || {}
                    })
                        .then((title) => {
                            console.log('resolving: ' + title);
                            resolve(title);
                        })
                        .catch((err) => {
                            console.log('error: ' + err);
                            reject(err);
                        });

                } catch (ex) {
                    console.log('wha? ' + ex);
                    reject(ex);
                }
            }));
        }
    );

    // resolve all the promises; but do NOT exit on any failures
    return Promise.allSettled(promises)
        .then((results) => {
            results.forEach((result) => {
                console.log('html-to-pdf settled: ' + result.status);
            })
        });
};
