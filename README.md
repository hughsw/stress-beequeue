# Stress Bee-Queue

Docker image for simple, but stressful exercising of the excellent [Bee-Queue task queue](https://github.com/bee-queue/bee-queue).

## Reproduce a subtle problem

Bee-Queue occasionally loses track of jobs, and the job does not emit either of the 'succeeded' or 'failed' events even though the job has finished.
The steps here provide somewhat of a sandbox for diagnosing [this Issue](https://github.com/bee-queue/bee-queue/issues/189).
See also this [Bee-Queue Issue](https://github.com/bee-queue/bee-queue/issues/78).

All examples assume you're in the directory with this README and the stress-beequeue code.
Prerequesites include a working Docker installation and bash.

These instructions are Mac specific and tested using Docker for Mac.
You will have to change the `REDIS_HOST` env to work in other Docker environments.

### Build the Docker image

```bash
$ ./build

...

Successfully tagged stress-beequeue:latest
+ rc=0
+ set +ex
```


### Run Redis

> Note: If you already have a Redis server running, skip this step

In a shell in, use Docker and start a Redis server.

```bash
$ mkdir redis-data
$ docker run --init --rm -p 6379:6379 -v $(pwd)/redis-data:/data redis:5-alpine

...

... * Ready to accept connections
```

### Run the Bee-Queue server

In another shell start the Bee-Queue server.
Set `REDIS_HOST` and/or `REDIS_PASSWORD` as necessary to access the Redis server.

```bash
$ REDIS_HOST=docker.for.mac.localhost  BEEQUEUE_CONCURRENCY=3 ./run-server

...

Stress Bee-Queue ready: server config: {"concurrency":3}
```

### Run the Bee-Queue client

In another shell, run the Bee-Queue client.

```bash
$  REDIS_HOST=docker.for.mac.localhost  BEEQUEUE_NUMCHAINS=4 BEEQUEUE_INTERVAL=500 ./run-client
+ docker run --init -it --rm --env REDIS_HOST=docker.for.mac.localhost --env REDIS_PASSWORD= --env BEEQUEUE_NUMCHAINS=4 --env BEEQUEUE_INTERVAL=500 stress-beequeue node src/client.js
Starting stress-beequeue client
redisCallback: connect: undefined
redisCallback: ready: undefined
Redis dbsize: 1
Stress BeeQueue ready: client config: {"numChains":4,"interval":500}
[125,125,125,125], job.id: 10564, numSucceeded: 500, numFailed: 0, averagedJobsPerSec: 182
[250,250,250,250], job.id: 11064, numSucceeded: 1000, numFailed: 0, averagedJobsPerSec: 187
[375,375,375,375], job.id: 11564, numSucceeded: 1500, numFailed: 0, averagedJobsPerSec: 186
...
```

The interesting part is the array of counts (histogram) at the start of each line.
This shows how many times each of the four job-chains has emitted 'succeeded'.
It starts off being uniform.
But, as Bee-Queue occasionally loses track of jobs, the bins corresponding to dead chains stop updating.

```bash
$ REDIS_HOST=docker.for.mac.localhost  BEEQUEUE_NUMCHAINS=4 BEEQUEUE_INTERVAL=500 ./run-client
+ docker run --init -it --rm --env REDIS_HOST=docker.for.mac.localhost --env REDIS_PASSWORD= --env BEEQUEUE_NUMCHAINS=4 --env BEEQUEUE_INTERVAL=500 stress-beequeue node src/client.js
Starting stress-beequeue client
redisCallback: connect: undefined
redisCallback: ready: undefined
Redis dbsize: 1
Stress BeeQueue ready: client config: {"numChains":4,"interval":500}
[125,125,125,125], job.id: 10564, numSucceeded: 500, numFailed: 0, averagedJobsPerSec: 182
[250,250,250,250], job.id: 11064, numSucceeded: 1000, numFailed: 0, averagedJobsPerSec: 187
[375,375,375,375], job.id: 11564, numSucceeded: 1500, numFailed: 0, averagedJobsPerSec: 186
[523,523,523,431], job.id: 12065, numSucceeded: 2000, numFailed: 0, averagedJobsPerSec: 185
[690,690,689,431], job.id: 12565, numSucceeded: 2500, numFailed: 0, averagedJobsPerSec: 185
[906,905,758,431], job.id: 13066, numSucceeded: 3000, numFailed: 0, averagedJobsPerSec: 181
[1156,1155,758,431], job.id: 13566, numSucceeded: 3500, numFailed: 0, averagedJobsPerSec: 177
[1406,1405,758,431], job.id: 14066, numSucceeded: 4000, numFailed: 0, averagedJobsPerSec: 175
[1656,1655,758,431], job.id: 14566, numSucceeded: 4500, numFailed: 0, averagedJobsPerSec: 172
[1906,1905,758,431], job.id: 15066, numSucceeded: 5000, numFailed: 0, averagedJobsPerSec: 170
[2156,2155,758,431], job.id: 15566, numSucceeded: 5500, numFailed: 0, averagedJobsPerSec: 168
[2406,2405,758,431], job.id: 16066, numSucceeded: 6000, numFailed: 0, averagedJobsPerSec: 167
[2656,2655,758,431], job.id: 16566, numSucceeded: 6500, numFailed: 0, averagedJobsPerSec: 166
...

```
After 3000 jobs, only two chains are continuing to work.
If all the chains die, the output stops updating because no jobs are being generated.

> Note: The `averagedJobsPerSec` is taken over the duration of the the runtime of `./run-client` and becomes deceptively small, e.g. if Redis is shutdown and then restarted later.

## Configuration env vars

Redis

* `REDIS_HOST` - Hostname of Redis server --  may be a special name if Redis is running in Docker, e.g. `docker.for.mac.localhost`
* `REDIS_PASSWORD` - Credentials for the Redis server

Bee-Queue stress settings

* `BEEQUEUE_CONCURRENCY` -  The server-side Bee-Queue concurrency -- how many jobs are running at the same time.
This setting may affect the occurrence of the problem.
* `BEEQUEUE_NUMCHAINS` - The client-side number of job chains to start.
A chain is a sequence of jobs whereby when a job emits 'succeeded' or 'failed', a new job is created.
If Bee-Queue did not lose jobs, each chain would run indefinitely.
This setting may affect the occurrence of the problem.
* `BEEQUEUE_INTERVAL` - Client side count of number of 'succeeded' events between reporting summary statistics.
This is simply to control how rapidly info scrolls.


## Details

* Read the client-side code in [./src/client-side.ts](./src/client-side.ts)
* Read the Bee-Queue configuration code in [./src/stress-beequeue.ts](./src/stress-beequeue.ts)
