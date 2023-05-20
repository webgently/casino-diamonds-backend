import { Server, Socket } from 'socket.io';

export const initSocket = (io: Server) => {
  io.on('connection', async (socket: Socket) => {
    console.log('new User connected:' + socket.id);

    socket.on('disconnect', () => {
      console.log('socket disconnected ' + socket.id);
    });
  });
};