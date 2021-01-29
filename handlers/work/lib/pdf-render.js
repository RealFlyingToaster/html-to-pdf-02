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
        let navHost = new URL(url).host;
        //    memcheck.summary();
        browser = await chromium.puppeteer.launch({
            executablePath: await chromium.executablePath,
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            headless: chromium.args
        });
        console.log('pdf: a: ' + navHost);
        page = await browser.newPage();
        console.log('pdf: a1');
        if (context && context.headers) {
            await page.setRequestInterception(true);

            page.on('request', (request) => {
                console.log('Request: ' + request.url());
                let reqHost = new URL(request.url()).host;
                // override request headers
                // Do nothing in case of non-navigation requests.
                if (reqHost !== navHost) {
                    request.continue();
                    return;
                }
                const headers = Object.assign({},
                    request.headers(),
                    context.headers
                );
                console.log('...headers: ' + JSON.stringify(headers));
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
        //page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
        await page.goto(url, { waitUntil: ['load', 'domcontentloaded', 'networkidle0'] });
        console.log('pdf: a2');
        // make sure all fonts have loaded
        await page.evaluateHandle('document.fonts.ready');
        const pdf = await page.pdf({
            fullPage: true,
            format: 'letter',
            margin: {
                top: '.5in',
                bottom: '.5in',
                right: '.5in',
                left: '.5in'
            },
            scale: 0.75,
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
        console.log('cleanup');
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