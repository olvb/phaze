const Search = require('youtube-api-search');
import { StyleSheet, Image, Text, View, Button } from 'react-native';
import { API_KEY } from '@env';

// TODO: doing a search like that will bear the risk that 'audio only'
// of the video doesn't exist when using YTDL to stream the audio later
export default function VideoSearch({ onSubmit }) {
  // TODO: will be replaced with form
  term = 'Mittagsmagazin - Jingle - Musik';
  videoSearch = (search) => {
    Search({ key: API_KEY, term: search }, (v) => {
      if (v.length > 0) {
        onSubmit(v);
      } else {
        alert('No videos could be found');
      }
    });
  };
  return (
    <View style={{ backgroundColor: 'purple' }}>
      <Text style={{ color: 'white' }}> Search Box Comes Here</Text>
      <Button
        title="Search"
        onPress={() => {
          videoSearch(term);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 50,
  },
  tinyLogo: {
    width: 160,
    height: 90,
  },
  logo: {
    width: 66,
    height: 58,
  },
});
