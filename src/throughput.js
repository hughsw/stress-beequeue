const { appendFile } = require('fs');

const {
  safeNumber,
  log,
  delay,
//  logJob,
} = require('./utils');


//const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);

const inPlay = {};
const toggleInPlay = key => {
  //return;
  if (inPlay[key]) delete inPlay[key];
  else inPlay[key] = true;
};

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, fixedDelay, randomDelay, interval}) => {

  const maxNumChains = numChains;

  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, fixedDelay: ${fixedDelay}, randomDelay: ${randomDelay}`);

  stats = {
    startTime: Date.now(),
    globalJobNumber: 0,
    numJobSucceeded: 0,
    numJobFailed: 0,
    numJobSaveError: 0,
    numQueueJobSucceeded: 0,
    numQueueJobFailed: 0,
    numChainsRunning: 0,
  };

  const config = { stats, verbose, failPercent, fixedDelay, randomDelay };

  const adjustChains = (chain = null) => {
    if (chain !== null) {
      if (chain >= numChains) {
        --stats.numChainsRunning;
        return;
      } else {
        createChainJob(queue, config, chain);
      }
    }

    while (stats.numChainsRunning < numChains) {
      createChainJob(queue, config, stats.numChainsRunning);
      ++stats.numChainsRunning;
    }
  };

  const jobFinished = async jobId => {
    toggleInPlay(jobId);
    const job = await queue.getJob(jobId);
    adjustChains(job.data.chain);
    queue.removeJob(jobId);
    // uuggg -- prevent memory leaks
    queue.jobs.delete(jobId);
    //job.removeAllListeners();
  };

  queue.on('job succeeded', async (jobId, result) => {
    ++stats.numQueueJobSucceeded;
    jobFinished(jobId);
  });

  queue.on('job failed', async (jobId, err) => {
    ++stats.numQueueJobFailed;
    jobFinished(jobId);
  });

  adjustChains();


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

  const sampleMsec = 3000;

  const doCheck = async () => {
    //await log(JSON.stringify(stats));
    //return;

    const startTime = Date.now();
    const startStats = { ...stats };
    numChains = 1 + Math.floor(Math.random() * maxNumChains);
    await delay(sampleMsec);
    const elapsedMsec = Date.now() - startTime;
    const endStats =  { ...stats };

    const health = await queue.checkHealth();

    const jobNumber = endStats.globalJobNumber;
    const numChainsRunning = endStats.numChainsRunning;
    const deltaJobNumber = endStats.globalJobNumber - startStats.globalJobNumber;
    const deltaNumFinished = (endStats.numQueueJobSucceeded + endStats.numQueueJobFailed) - (startStats.numQueueJobSucceeded + startStats.numQueueJobFailed);
    const failureFraction = (endStats.numQueueJobFailed - startStats.numQueueJobFailed) / deltaNumFinished;
    const failurePercent = (failureFraction * 100).toFixed(1);
    const deltaNumLost = deltaNumFinished - ((endStats.numJobSucceeded + endStats.numJobFailed) - (startStats.numJobSucceeded + startStats.numJobFailed));
    const throughput = (deltaNumFinished * 1000 / elapsedMsec).toFixed(0);
    const lossFraction = deltaNumLost / deltaNumFinished;
    const lossPercent = (lossFraction * 100).toFixed(1);
    const inPlayLength = Object.keys(inPlay).length;
    const concurrency = 3;
    const numWorkers = 4;

    const report = {
      startTime,
      elapsedMsec,
      jobNumber,
      numChainsRunning,
      deltaJobNumber,
      deltaNumFinished,
      failurePercent,
      deltaNumLost,
      throughput,
      lossPercent,
      inPlayLength,
      concurrency,
      numWorkers,
    };
    const reportJson = JSON.stringify(report);

    await log(`health: ${JSON.stringify(health)}`);
    await log(reportJson);

    appendFile(`/data/${stats.startTime}.json`, reportJson + '\n', log);;
  }
  setInterval(doCheck, sampleMsec);

};

const createChainJob = (queue, config, chain) => {
  const { stats, verbose, failPercent, fixedDelay, randomDelay } = config;

  const jobNumber = ++stats.globalJobNumber;
  verbose >= 2 && log(`createChainJob: jobNumber: ${jobNumber}, chain: ${chain}`);

  const delay = (fixedDelay && fixedDelay > 0 ? fixedDelay : 0) + (randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0);
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({jobNumber, chain, delay, failme});

  //*
  //const cleanup = () => job.removeAllListeners();
  //const cleanup = () => undefined;

  job.on('succeeded', async result => {
    verbose >= 2 && log(`job client 'succeeded': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobSucceeded;
    //cleanup();
  });

  job.on('failed', async error => {
    verbose >= 2 && log(`job client 'failed': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobFailed;
    //cleanup();
  });
  //*/

  job.save()
    .then(() => {
      verbose >= 2 && log(`job.save(): job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
      toggleInPlay(job.id);
    })
    .catch(error => {
      log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`);
      ++stats.numJobSaveError;
    });

};

module.exports = exports = {
  doClientQueue,
};
