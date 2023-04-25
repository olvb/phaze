const ytdl = require('ytdl-core');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3002 });

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
