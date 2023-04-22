import { StyleSheet, View, TextInput, Dimensions } from 'react-native';
import { useState } from 'react';
import { API_KEY } from '@env';
import * as axios from 'axios';

let SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
let DETAILS_URL = 'https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=';

// TODO: doing a search like that will bear the risk that 'audio only'
// of the video doesn't exist when using YTDL to stream the audio later
export default function VideoSearch({ onSubmit }) {
  const [searchInput, onChangeInput] = useState(null);

  const params = {
    part: 'snippet',
    key: API_KEY,
    q: '',
    type: 'video',
    videoDuration: 'short',
    order: 'relevance',
    maxResults: 40,
  };

  function videoSearch() {
    if (searchInput !== '') {
      params.q = searchInput;
      axios
        .get(SEARCH_URL, { params: params })
        .then((response) => response.data.items)
        .then((videos) => {
          if (videos.length > 0) {
            const joinedIds = videos.map((video) => video.id.videoId).join('&id=');
            const finishedURL = DETAILS_URL + joinedIds + '&key=' + API_KEY;

            axios.get(finishedURL).then((response) => {
              // we do this to keep the order of our returns and easily assign the duration to our target object
              for (let i = 0; i < response.data.items.length; i++) {
                videos[i].duration = ISO8601toVideoLength(response.data.items[i].contentDetails.duration);
              }
              onSubmit(videos);
            });
          }
        })
        .catch(function (error) {
          console.error(error);
        });
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        onChangeText={onChangeInput}
        value={searchInput}
        placeholder="Search"
        placeholderTextColor="grey"
        onSubmitEditing={() => {
          videoSearch();
        }}
      />
    </View>
  );
}

function ISO8601toVideoLength(input) {
  // we won't allow any videos longer than 4min
  let res = input
    .replace('PT', '')
    .replace(/[a-zA-Z]/g, ':')
    .slice(0, -1);

  // check if output is purely a number
  if (+res === Number(res)) {
    if (res < 10) {
      res = '0' + res;
    }
    res = '00:' + res;
  }

  // add a zero at the end of seconds if it's just one digit
  if (res.match(/\d+:\d$/)) {
    res = res + '0';
  }

  return res;
}

const windowsHeight = Dimensions.get('window').height;
const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: windowsHeight / 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: '90%',
    height: 35,
    margin: 12,
    borderRadius: 5,
    padding: 10,
    color: 'white',
    backgroundColor: '#3b3b3b',
  },
});
