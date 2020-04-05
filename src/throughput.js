
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
let numJobSaveError = 0;

let numQueueJobSucceeded = 0;
let numQueueJobFailed = 0;

let numChainsStarted = 0;
const inPlay = {};
const toggleInPlay = key => {
  if (inPlay[key]) delete inPlay[key];
  else inPlay[key] = true;
};

let adjust = 0;


// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, randomDelay, interval}) => {
  const startTime = Date.now();
  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, randomDelay: ${randomDelay}`);

  const config = { chain: 0, verbose, failPercent, randomDelay, interval };

  const jobFinished = async jobId => {
    //setTimeout(() => delete inPlay[jobId], 33);
    toggleInPlay(jobId);
    const job = await queue.getJob(jobId);
    queue.removeJob(jobId);
    //log(`jobFinished: job.data: ${JSON.stringify(job.data)}`);
    startJobChain(queue, config);
  };


  queue.on('job succeeded', async (jobId, result) => {
    //log(`queue client 'job succeeded': jobId: ${jobId}`);
    ++numQueueJobSucceeded;
    jobFinished(jobId);
    //setTimeout(() => delete inPlay[jobId], 1);
    //startJobChain(queue, config);
  });

  queue.on('job failed', async (jobId, err) => {
    //log(`queue client 'job failed': jobId: ${jobId}`);
    ++numQueueJobFailed;
    jobFinished(jobId);
    // delay, or otherwise we can delete a jobId before it's been added
    //setTimeout(() => delete inPlay[jobId], 1);
    //delete inPlay[jobId];
    //startJobChain(queue, config);
  });

  while (numChainsStarted < numChains) {
    startJobChain(queue, config);
    ++numChainsStarted;
  }

  // check number of active jobs and start more as needed

  let waitingSum;
  let activeSum;
  let statCount;
  const statReset = () => {
    waitingSum = 0;
    activeSum = 0;
    statCount = 0;
  };
  const statSum = ({ waiting, active }) => {
    waitingSum += waiting;
    activeSum += active;
    ++statCount;
  };
  const statAvg = () => ({
    waitingAvg: waitingSum / statCount,
    activeAvg: activeSum / statCount,
  });
  const statSample = async () => {
    const { waiting, active } = await queue.checkHealth();
    statSum({ waiting, active });
  };

  statReset();
  setInterval(statSample, 16);

  const doCheck = async () => {
    const elapsedMsec = Date.now() - startTime;
    const jobNumber = globalJobNumber;

    const numFinished = numQueueJobSucceeded + numQueueJobFailed;
    const numPlay = jobNumber - numFinished;
    const numLost = numFinished - (numJobSucceeded + numJobFailed);
    const lossFraction = numLost / numFinished;
    const lossPercent = (lossFraction * 100).toFixed(1);

    const throughput = (numFinished * 1000 / elapsedMsec).toFixed(0);
    //const inPlay = jobNumber - numFinished;

    //const missingSucceeded = numQueueJobSucceeded - numJobSucceeded;
    //const missingFailed = numQueueJobFailed - numJobFailed;
    //const counts = { numQueueJobSucceeded, missingSucceeded, numQueueJobFailed, missingFailed };
    const health = await queue.checkHealth();
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, counts: ${JSON.stringify(counts)}`);
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, throughput: ${throughput}, lossPercent: ${lossPercent}`);
    const { waitingAvg, activeAvg } = statAvg();
    statReset();
    await log(`jobNumber: ${jobNumber}, numPlay: ${numPlay}, numJobSaveError: ${numJobSaveError}, throughput: ${throughput}, lossPercent: ${lossPercent}, numChainsStarted: ${numChainsStarted}, inPlay: ${Object.keys(inPlay).length}, waitingAvg: ${waitingAvg.toFixed(3)}, activeAvg: ${activeAvg.toFixed(3)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, throughput: ${throughput}, lossPercent: ${lossPercent}, numChainsStarted: ${numChainsStarted}, inPlay: ${inPlay}, health: ${JSON.stringify(health)}`);

    //const waitingThresh = 3.5;
    const waitingThresh = 0.33;
    if (waitingAvg >= waitingThresh) {
      --adjust;
    } else if (waitingAvg <= waitingThresh - 0.25) {
      ++adjust;
    }
  }
  setInterval(doCheck, 3000);
};

//const startJobChain = async (queue, config) => {
const startJobChain = (queue, config) => {
  if (false && adjust !== 0) {
    // skip one start
    if (adjust < 0) {
      ++adjust;
      --numChainsStarted;
      return;
    }
    // one additional start
    --adjust;
    ++numChainsStarted;
    startJobChain(queue, config);
  }

  const jobNumber = ++globalJobNumber;
  const { chain, verbose, failPercent, randomDelay, interval } = config;
  verbose >= 2 && log(`startJobChain: jobNumber: ${jobNumber}, ${JSON.stringify(config)}`);

  const delay = randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0;
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({jobNumber, chain, delay, failme});

  job.on('succeeded', async result => {
    verbose >= 2 && log(`job client 'succeeded': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++numJobSucceeded;
  });

  job.on('failed', async error => {
    verbose >= 2 && log(`job client 'failed': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++numJobFailed;
  });

  job.save()
    .then(() => {
      verbose >= 2 && log(`job.save(): job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
      toggleInPlay(job.id);
    })
    .catch(error => {
      log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`);
      ++numJobSaveError;
    });

};

module.exports = exports = {
  doClientQueue,
};
