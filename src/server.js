// Server -- Queue.process()

const { startServer } = require('./shared-bee-queue');

startServer()
  .catch(error => {
    console.log('server error:', error);
    console.log('server exit 1');
    process.exit(1);
  });
