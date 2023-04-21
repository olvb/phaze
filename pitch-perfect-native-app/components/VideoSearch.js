const Search = require('youtube-api-search');
import { StyleSheet, View, TextInput, Dimensions } from 'react-native';
import { useState } from 'react';
import { API_KEY } from '@env';

// TODO: doing a search like that will bear the risk that 'audio only'
// of the video doesn't exist when using YTDL to stream the audio later
export default function VideoSearch({ onSubmit }) {
  const [searchInput, onChangeInput] = useState(null);

  function videoSearch() {
    if (searchInput !== '') {
      Search({ key: API_KEY, term: searchInput }, (v) => {
        if (v.length > 0) {
          onSubmit(v);
        } else {
          alert('No videos could be found');
        }
      });
      // reset input
      onChangeInput('');
    }
  }

  return (
    // <View style={{ backgroundColor: 'purple' }}>

    <View style={styles.container}>
      {/* term = 'Mittagsmagazin - Jingle - Musik'; */}
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
