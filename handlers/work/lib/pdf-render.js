console.log('renderer initializing');

const chromium = require('chrome-aws-lambda'),
    AWS = require('aws-sdk'),
    s3 = new AWS.S3(),
    memcheck = require('./memcheck');

exports.pdf = async (url, context) => {
    let browser = null,
        page = null,
        except = null;

    try {
        // one browser per request.
        console.log('pdf: 0');
        browser = await chromium.puppeteer.launch({
            executablePath: await chromium.executablePath,
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            headless: chromium.args
        });
        console.log('pdf: a');
        page = await browser.newPage();
        page.setViewport({ width: 900, height: 900, deviceScaleFactor: 2 });
        console.log('pdf: a1');
        if (context && context.headers && context.headers.hosts) {
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                console.log('Request: ' + request.url());
                let reqHost = new URL(request.url()).host,
                    hostHeaders = context.headers.hosts[reqHost];
                // override request headers
                // Do nothing if no headers specified for this host.

                if (!hostHeaders) {
                    request.continue();
                    return;
                }
                const headers = Object.assign({},
                    request.headers(),
                    hostHeaders
                );
                console.log('...headers applied');
                //console.log('...headers: ' + JSON.stringify(headers));
                request.continue({ headers });
            });
            // console logging.
            page
                .on('console', message =>
                    console.log(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`))
                .on('pageerror', ({ message }) => console.log(message))
                .on('response', response =>
                    console.log(`${response.status()} ${response.url()}`))
                .on('requestfailed', request =>
                    console.log(`${request.failure().errorText} ${request.url()}`));
        }
        await page.goto(url, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'] });
        console.log('pdf: a2');
        // make sure all fonts have loaded
        await page.evaluateHandle('document.fonts.ready');
        console.log('pdf: a3');
        const pdf = await page.pdf({
            fullPage: true,
            format: 'Letter',
            margin: {
                top: '.5in',
                bottom: '.5in',
                right: '.5in',
                left: '.5in'
            },
            scale: 0.80, // .68 = 7.5" * 96dpi / 1056px natural width
            printBackground: true
        });
        console.log('pdf: b');

        const s3params = {
            Bucket: context.bucketName,
            Key: context.key,
            Body: pdf
        }

        await s3.putObject(s3params).promise();

        console.log('pdf: d');

    } catch (ex) {
        console.error(ex);
        except = ex;
    } finally {
        //console.log('cleanup');
        memcheck.summary();
        // clean up puppeteer world no matter what
        if (page) {
            await page.close();
        }
        if (browser) {
            await browser.close();
        }
    }

    console.log('pdf: e');

    // NOW fail.
    if (except) {
        throw (except);
    }

    return context.key;
};