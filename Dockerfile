FROM node:lts-alpine

COPY package*.json /stress-beequeue/
RUN cd /stress-beequeue && npm --version && npm ci

COPY tsconfig.json /stress-beequeue/
COPY src /stress-beequeue/src/
#RUN cd /stress-beequeue && npm run build

WORKDIR /stress-beequeue
# Default.  There's also src/client.js
CMD node src/server.js
