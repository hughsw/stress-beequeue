#!/bin/bash

# strict and loud failure
set -euo pipefail
trap 'rc=$?;set +ex;if [[ $rc -ne 0 ]];then trap - ERR EXIT;echo 1>&2;echo "*** fail *** : code $rc : $DIR/$SCRIPT $ARGS" 1>&2;echo 1>&2;exit $rc;fi' ERR EXIT
ARGS="$*"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$(basename "${BASH_SOURCE[0]}")"

# Specific client module to exercise, file ./src/$client.js must exist
client=$1

imageTag=$(basename $DIR)

cd $DIR

# Fail-fast on client module
node --check src/$client.js

set -x

#docker-compose rm --force redis || true
#docker volume rm --force  ${imageTag}_redisVolume || true

docker build --tag $imageTag --file Dockerfile .

# Establish a clean slate for Redis, see volumes in docker-compose.yml
redisDataDir=./.redisData
touch $redisDataDir
rm -r $redisDataDir
mkdir -p $redisDataDir

#docker-compose up --force-recreate  --abort-on-container-exit --timeout 7
eval BEEQUEUE_CLIENT=$client docker-compose up  --scale server=4 --force-recreate --remove-orphans  --abort-on-container-exit  --timeout 3

set +x
