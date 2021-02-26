console.log('renderer initializing');

const puppeteer = require('puppeteer'),
    fsPromises = require('fs').promises,
    findRemove = require('find-remove');

const clean = async () => {
    // clean the temporary directory if told to.
    if (this.expires && this.expires > 0) {
        try {
            findRemove(this.localPath, { extensions: ['.pdf'], age: { seconds: this.expires }, maxLevel: 1 });
        } catch (ex) {
            console.error('Exception on clean: ' + ex.message);
        }
    }
}

exports.pdf = async (url, context) => {
    let browser = null,
        page = null,
        except = null,
        fileHandle,
        filePath = context.path,
        successPath = '';

    try {
        // one browser per request.
        console.log('pdf: 0');
        browser = await puppeteer.launch({
            headless: true
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

        // write the PDF to disk.

        try {
            fileHandle = await fsPromises.open(filePath, 'w');
            await fileHandle.writeFile(pdf);
            console.info('...done');
            successPath = filePath; // only set when whole operation is successful
        } finally {
            if (fileHandle) {
                await fileHandle.close();
            }
        }

        console.log('pdf: e');

    } catch (ex) {
        console.error(ex);
        except = ex;
    } finally {
        console.log('cleanup');
        // clean up puppeteer world no matter what
        if (page) {
            await page.close();
        }
        if (browser) {
            await browser.close();
        }
        await clean();
    }

    console.log('pdf: e');

    // NOW fail.
    if (except) {
        throw (except);
    }

    return successPath;
};