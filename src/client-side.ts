
import { debug, log } from './log';

// Client side logic

export const runJobs = async ({queue, numChains, interval}) => {
  // Here's where we collect evidence of BeeQueue losing track of jobs.  That is,
  // occasionally BeeQueue does not emit either of 'succeeded' or 'failed' for a job, even
  // though the job has finished.

  // We start numChains job chains.  A chain is where each 'succeeded' event creates a new
  // job ('failed' event also creates a new job).  We keep a histogram of succeeded
  // counts, binned by chain.  As BeeQueue fails to emit 'succeeded' (or 'failed') events,
  // the chains die and the histogram becomes non-uniform.

  let numSucceeded = 0;
  let numFailed = 0;
  const histogram = new Array(numChains);
  histogram.fill(0);

  const startTimeMsec = Date.now();

  // chainIndex is the bin of the histogram to increment
  const runJob = async (chainIndex:number) => {
    const job = queue.createJob({ failme: false });

    // chain: succeeded and failed will each create a new job with the same chainIndex
    job.on('succeeded', async (result:any) => {
      debug && log(`JOB succeeded: chainIndex: ${chainIndex}, queue.name: ${queue.name}, job.id: ${job.id}, succeeded with result: ${JSON.stringify(result)}`);
      ++numSucceeded;
      ++histogram[chainIndex];
      if (numSucceeded % interval === 0) {
        const durationSec = (Date.now() - startTimeMsec) / 1000;
        // This is an average throughput over the entire run, not just this interval.
        // As the chains die, this throughput declines
        const averagedJobsPerSec = Math.floor(numSucceeded / durationSec);
        log(`${JSON.stringify(histogram)}, job.id: ${job.id}, numSucceeded: ${numSucceeded}, numFailed: ${numFailed}, averagedJobsPerSec: ${averagedJobsPerSec}`);
      }
      // never break the chain
      setTimeout(runJob, 0, chainIndex);
    });

    job.on('failed', async (err:any) => {
      log(`JOB failed: chainIndex: ${chainIndex}, queue.name: ${queue.name}, job.id: ${job.id}, failed with error ${err.message}`);
      ++numFailed;
      // never break the chain
      setTimeout(runJob, 0, chainIndex);
    });

    job.on('retrying', (err:any) => log(`JOB retrying: chainIndex: ${chainIndex}, queue.name: ${queue.name}, job.id: ${job.id}, failed with error ${err.message} but is being retried!`));
    job.on('progress', (progress:number) => log(`JOB progress: chainIndex: ${chainIndex}, queue.name: ${queue.name}, job.id: ${job.id}, reported progress: ${progress}%`));

    await job.save().catch(error => log(`job.save catch: chainIndex: ${chainIndex}, error: ${error}`));
  };

  // Start numChains chains
  for( let chainIndex = 0; chainIndex < numChains; ++chainIndex ) {
    runJob(chainIndex);
  };

};
