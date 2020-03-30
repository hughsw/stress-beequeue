// Client -- Queue.createJob()
const { startClient } = require('./shared-bee-queue');
console.log('Starting bee-queue client: Queue.createJob()');
startClient()
  .catch(error => {
    console.log('client error:', error);
    console.log('client exit 1');
    process.exit(1);
  });
