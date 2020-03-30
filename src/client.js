// Client -- Queue.createJob()
//
// Client module file is named via process.env.BEEQUEUE_CLIENT

const { startClient } = require('./shared-bee-queue');

startClient()
  .catch(error => {
    console.log('client error:', error);
    console.log('client exit 1');
    process.exit(1);
  });
