/**
 * @jest-environment node
 */

const AWS = require("aws-sdk"),
    axios = require('axios'),
    payload = require('../../scripts/testPayload.json');

const sleep = (secs) =>
    new Promise((resolve) => setTimeout(resolve, 1000 * secs));

// set the region
AWS.config.update({ region: process.env["AWS_DEFAULT_REGION"] });

/**
 * Get stack name from environment variable AWS_SAM_STACK_NAME and make an API call to verify the stack exists.
 * throw exception if AWS_SAM_STACK_NAME is not set.
 */
const getAndVerifyStackName = async () => {
    const stackName = process.env["AWS_SAM_STACK_NAME"];

    if (!stackName) {
        throw new Error(
            "Cannot find env var AWS_SAM_STACK_NAME.\n" +
            "Please setup this environment variable with the stack name where we are running integration tests."
        );
    }

    const client = new AWS.CloudFormation();
    try {
        await client
            .describeStacks({
                StackName: stackName,
            })
            .promise();
    } catch (e) {
        throw new Error(
            `Cannot find stack ${stackName}: ${e.message}\n` +
            `Please make sure stack with the name "${stackName}" exists.`
        );
    }

    return stackName;
};

/**
 * This test publish a testing message to sns topic
 * and make sure cloudwatch has corresponding log entry.
 */
describe("Test Trigger Function", function () {
    let triggerDomain,
        scratchBucket;

    /**
     * Based on the provided stack name,
     * here we use cloudformation API to find out what the SNSPayloadLogger and SimpleTopic are
     */
    beforeAll(async () => {
        const stackName = await getAndVerifyStackName();

        const client = new AWS.CloudFormation();
        const response = await client
            .describeStacks({
                StackName: stackName,
            })
            .promise();

        console.log('Resources: ' + JSON.stringify(response));
        const outputs = response.Stacks[0].Outputs;

        const triggerDomainOutput = outputs.find(
            (output) => output.OutputKey === "TriggerDomain"
        );
        expect(triggerDomainOutput).not.toBe(undefined);

        const bucketOutput = outputs.find(
            (output) => output.OutputKey === "ScratchBucket"
        );
        expect(bucketOutput).not.toBe(undefined);

        triggerDomain = triggerDomainOutput.OutputValue;
        scratchBucket = bucketOutput.OutputValue;
    });

    const checkForS3Object = async (params) => {
        s3 = new AWS.S3();
        const s3Params = {
            Bucket: params.bucket,
            MaxKeys: 1,
            Prefix: params.prefix
        };

        console.info('S3 params: ' + JSON.stringify(s3Params));

        let item = null;
        let start = new Date();

        do {
            await sleep(1);
            await s3.listObjectsV2(s3Params).promise()
                .then((data) => {
                    console.info('S3 poll: ' + (new Date() - start) + ' ' + JSON.stringify(data));
                    if (data && data.Contents && data.Contents.length > 0)
                        item = data.Contents[0];
                });
        } while (null === item);
    };

    const callApi = async (url, payload) => {
        return new Promise((resolve, reject) => {
            axios.put(url, payload)
                .then((response) => { resolve(response); })
                .catch((err) => { reject(err); });
        });
    };


    /**
     * Hit the trigger API and poll S3 to make sure the file arrived
     */
    it("When trigger function called, ", async () => {
        console.info("Trigger API:", triggerDomain, "; scratch bucket:", scratchBucket, "; payload: ", payload);
        const response = await axios.post(triggerDomain, payload);
        expect(response).not.toBe(null);
        console.info('API returns: ' + JSON.stringify(response.data));
        const data = response.data;
        expect(data).not.toBe(null);
        expect(data.job).not.toBe(null);
        expect(data.defaultBucket).not.toBe(null);
        expect(data.key).not.toBe(null);

        await checkForS3Object({
            bucket: data.defaultBucket,
            prefix: data.key.slice(0, data.key.lastIndexOf('/'))
        });

    }, 60000); // timeout 60 secs, it takes some time for cloudwatch log to show up
});
