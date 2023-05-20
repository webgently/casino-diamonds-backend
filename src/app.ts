import http from 'http';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { Server } from 'socket.io';

import config from './config.json';
import { setlog } from './helper';
import { connect } from './model';
import { initSocket } from './socket';

process.on('uncaughtException', (error) => setlog('exception', error));
process.on('unhandledRejection', (error) => setlog('rejection', error));

const app = express();
const server = http.createServer(app);

connect().then(async (loaded) => {
  if (loaded) {
    setlog('connected to MongoDB');

    app.use(cors({ origin: '*' }));
    app.use(express.urlencoded());
    app.use(bodyParser.json({ type: 'application/json' }));
    app.use(bodyParser.raw({ type: 'application/vnd.custom-type' }));
    app.use(bodyParser.text({ type: 'text/html' }));
    app.get('*', (req, res) => res.sendFile(__dirname + '/build/index.html'));

    const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    initSocket(io);
    app.set('io', io);

    server.listen({ port: config.port, host: '0.0.0.0' }, () => setlog(`Started HTTP service on port ${config.port}`));
  } else {
    setlog('Connection to MongoDB failed', loaded);
  }
});
