const ytdl = require('ytdl-core');
const WebSocket = require('ws');
const express = require('express');
const { createServer } = require('http');

const app = express();
const server = createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws) {
  console.log('connected');

  ws.on('error', console.error);

  ws.on('message', async function message(data) {
    console.log('youtube link: ', data.toString());
    let link = data.toString();
    const stream = await ytdl(link, { quality: 'highestaudio', filter: 'audioonly' });
    console.log('fetched stream');
    const body = [];
    stream
      .forEach((chunk) => {
        // console.log('Data chunck received >> ', chunk);
        body.push(chunk);
        console.log('buffering');
      })
      .then(() => {
        console.log('done buffering');
        const buffer = Buffer.concat(body);
        ws.send(buffer);
      });
  });
});

server.listen(3000, function () {
  console.log('Listening on http://127.0.0.1:3000');
});
