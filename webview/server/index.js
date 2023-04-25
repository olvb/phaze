const ytdl = require('ytdl-core');
const WebSocket = require('ws');
// const { createServer } = require('http');
// const express = require('express');

// const app = express();
// const wss = new WebSocket.Server({ server: app.listen(8080) });
const wss = new WebSocket.Server({ port: 8080 });

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
