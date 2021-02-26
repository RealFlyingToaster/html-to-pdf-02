  // repost the payload to the trigger API and wait for the result
  // parse the reply for the jobId
  // hang a custom event listener on the downloader
  // wait for the download
  // detach the listener
  // return the disk location of the downloaded file

  const axios = require('axios');

  class DownloadJob {
      constructor(params) {
        this.triggerDomain = params.triggerDomain;
        this.payload = params.payload;
      }

      async run() {
        const response = await axios.post(this.triggerDomain, this.payload);
        const jobId = response.data.job;
        console.log('Data: ' + JSON.stringify(response.data));
        return jobId;
      }
  }

  module.exports = DownloadJob;