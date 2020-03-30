// Server -- Queue.process()
const { startServer } = require('./shared-bee-queue');
console.log('Starting bee-queue server: Queue.process()');
startServer()
  .catch(error => {
    console.log('server error:', error);
    console.log('server exit 1');
    process.exit(1);
  });
