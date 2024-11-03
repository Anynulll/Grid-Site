import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('.'));

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('photoAdded', (photo) => {
        socket.broadcast.emit('photoAdded', photo);
    });

    socket.on('photoDeleted', (data) => {
        socket.broadcast.emit('photoDeleted', data);
    });

    socket.on('orderChanged', (photos) => {
        socket.broadcast.emit('orderChanged', photos);
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});