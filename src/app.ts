import http from 'http';
import express from 'express';
import cors from 'cors';
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

    app.use(
      cors({
          origin: "*",
          methods: ["POST", "GET"],
      })
    );
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Frontend Load
    app.use(express.static(__dirname + "/build"));
    app.get("/*", function (req: any, res: any) {
        res.sendFile(__dirname + "/build/index.html", function (err: any) {
            if (err) {
                res.status(500).send(err);
            }
        });
    });

    const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
    initSocket(io);
    app.set('io', io);

    server.listen({ port: config.port, host: '0.0.0.0' }, () => setlog(`Started HTTP service on port ${config.port}`));
  } else {
    setlog('Connection to MongoDB failed', loaded);
  }
});
