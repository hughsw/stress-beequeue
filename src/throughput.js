
const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);

let globalJobNumber = 0;

let numJobSucceeded = 0;
let numJobFailed = 0;

let numQueueJobSucceeded = 0;
let numQueueJobFailed = 0;

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, randomDelay, interval}) => {
  const startTime = Date.now();
  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, randomDelay: ${randomDelay}`);

  const config = { chain: 0, verbose, failPercent, randomDelay, interval };

  queue.on('job succeeded', async (jobId, result) => {
    //log(`queue client 'job succeeded': jobId: ${jobId}`);
    ++numQueueJobSucceeded;
    startJobChain(queue, config);
  });

  queue.on('job failed', async (jobId, err) => {
    //log(`queue client 'job failed': jobId: ${jobId}`);
    ++numQueueJobFailed;
    startJobChain(queue, config);
  });

  let numChainsStarted = 0;
  while (numChainsStarted < numChains) {
    startJobChain(queue, config);
    ++numChainsStarted;
  }

  // check number of active jobs and start more as needed

  const doCheck = async () => {
    const elapsedMsec = Date.now() - startTime;
    const jobNumber = globalJobNumber;
    const numFinished = numQueueJobSucceeded + numQueueJobFailed;

    const inPlay = jobNumber - numFinished;
    const throughput = (numFinished * 1000 / elapsedMsec).toFixed(0);

    const numLost = numFinished - (numJobSucceeded + numJobFailed);
    const lossPercent = (numLost * 100 / throughput).toFixed(1);

    //const missingSucceeded = numQueueJobSucceeded - numJobSucceeded;
    //const missingFailed = numQueueJobFailed - numJobFailed;
    //const counts = { numQueueJobSucceeded, missingSucceeded, numQueueJobFailed, missingFailed };
    const health = await queue.checkHealth();
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, counts: ${JSON.stringify(counts)}`);
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, throughput: ${throughput}, lossPercent: ${lossPercent}`);
    await log(`jobNumber: ${jobNumber}, throughput: ${throughput}, lossPercent: ${lossPercent}, inPlay: ${inPlay}, health: ${JSON.stringify(health)}`);

  }
  setInterval(doCheck, 3000);
};

const startJobChain = async (queue, config) => {
  const jobNumber = ++globalJobNumber;
  const { chain, verbose, failPercent, randomDelay, interval } = config;
  verbose >= 2 && log(`startJobChain: jobNumber: ${jobNumber}, ${JSON.stringify(config)}`);

  const delay = randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0;
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({chain, jobNumber, delay, failme});

  job.on('succeeded', async () => {
    verbose >= 2 && logJob(`job client 'succeeded': job.data.jobNumber: ${job.data.jobNumber}`);
    ++numJobSucceeded;
  });

  job.on('failed', async () => {
    verbose >= 2 && logJob(`job client 'failed': job.data.jobNumber: ${job.data.jobNumber}`);
    ++numJobFailed;
  });

  await job.save().catch(error => log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`))
  verbose >= 2 && logJob(`job.save: job.data.jobNumber: ${job.data.jobNumber}`);
};

module.exports = exports = {
  doClientQueue,
};
