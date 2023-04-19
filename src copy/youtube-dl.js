var ytdl = require('ytdl-core');
const fs = require('fs');

exports.youtubeDL = async () => {
  var link = 'https://www.youtube.com/watch?v=NEIKreM3sEY';

  const audioBuffer = ytdl(link, { quality: 'highestaudio', filter: 'audioonly' });
  audio.forEach((e) => console.log(e));
  return audioBuffer;
};

//main();
// audio.pipe(fs.createWriteStream(res));
