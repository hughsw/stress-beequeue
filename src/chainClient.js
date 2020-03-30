
const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);
const succeededHistogram = new Array(numChains2);
succeededHistogram.fill(0);
const failedHistogram = new Array(numChains2);
failedHistogram.fill(0);

let globalJobNumber = 0;

let numJobSucceeded = 0;
let numJobFailed = 0;

let queueNumSucceeded = 0;
let queueNumFailed = 0;

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, randomDelay, interval}) => {
  log(`doClientQueue: numChains: ${numChains}, randomDelay: ${randomDelay}`);

  queue.on('job succeeded', async (jobId, result) => {
  //queue.on('succeeded', async (job, result) => {
    //log(`queue client 'job succeeded': jobId: ${jobId}`);
    ++queueNumSucceeded;
    /*
    const job = await queue.getJob(jobId).catch(error => log(`succeeded: queue.getJob: error; ${error}`));
    //log(`queue client 'job succeeded': job: ${job}`);
    const chain = job.data.chain;
    ++succeededHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //setTimeout(startJobChain, delay(), queue);
    //setTimeout(startJobChain, 0, queue);
  });

  queue.on('job failed', async (jobId, err) => {
  //queue.on('failed', async (job, err) => {
    ++queueNumFailed;
    /*
    const job = await queue.getJob(jobId).catch(error => log(`failed: queue.getJob: error; ${error}`));
    const chain = job.data.chain;
    ++failedHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //logJob(`queue client 'failed'`, job);
    //setTimeout(startJobChain, 0, queue);
  });

//debug && log(`QUEUE ${beequeueName} succeeded: Job ${job.id} succeeded with result: ${JSON.stringify(result)}`));
  // queue.on('failed', (job:any, err:any) => debug && log(`QUEUE ${beequeueName} failed: Job ${job.id} failed with error '${err.message}', and retries ${job.options.retries}, status ${job.status}`));

  for (let chain = 0; chain < numChains; ++chain) {
    startJobChain({queue, chain, verbose, randomDelay, interval});
  }
};

const startJobChain = async ({queue, chain, verbose, randomDelay, interval}) => {
  verbose >= 2 && log(`startJobChain: ${JSON.stringify({chain, verbose, randomDelay, interval})}`);
  const jobNumber = ++globalJobNumber;

  if (jobNumber % interval === 0) {
    const maxSucceeded = Math.max(...succeededHistogram);
    const succeededDiffs = succeededHistogram.map(x => maxSucceeded - x);
    const maxFailed = Math.max(...failedHistogram);
    const failedDiffs = failedHistogram.map(x => maxFailed - x);

    const missingSucceeded = queueNumSucceeded - numJobSucceeded;
    const missingFailed = queueNumFailed - numJobFailed;
    //const counts = { queueNumSucceeded, missingSucceeded, queueNumFailed, missingFailed };
    const counts = { queueNumSucceeded, missingSucceeded, queueNumFailed, missingFailed };
    const health = await queue.checkHealth();
    await log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}`);
    //const counts = { jobNumber, queueNumSucceeded, queueNumFailed, numJobSucceeded, numJobFailed };
    //log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, succeededHistogram: ${JSON.stringify(succeededHistogram)}`);
    await log(`jobNumber: ${jobNumber}, succeededDiffs: ${JSON.stringify(succeededDiffs)}`);
    //await log(`jobNumber: ${jobNumber}, failedHistogram: ${JSON.stringify(failedHistogram)}`);
    //await log(`jobNumber: ${jobNumber}, failedDiffs: ${JSON.stringify(failedDiffs)}`);
    await log(`jobNumber: ${jobNumber}, health: ${JSON.stringify(health)}`);

  }

  const failme = false;
  //const failme = jobNumber % 2 === 0;

  const job = queue.createJob({chain, jobNumber, failme});

  job.on('succeeded', async result => {
    verbose >= 2 && logJob(`job client 'succeeded'`, job);
    ++numJobSucceeded
    //*
    const chain = job.data.chain;
    ++succeededHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/
  });

  job.on('failed', async error => {
    //logJob(`queue client 'failed'`, job);
    ++numJobFailed;
    //*
    const chain = job.data.chain;
    ++failedHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/
  });

  await job.save().catch(error => log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`))
  verbose >= 2 && logJob('createJob', job);
};

module.exports = exports = {
  doClientQueue,
};
