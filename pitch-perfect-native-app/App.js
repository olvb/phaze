import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Dimensions, Button } from 'react-native';
import { useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import VideoList from './components/VideoList';
import VideoSearch from './components/VideoSearch';
import { WEBVIEW_URL } from '@env';

export default function App() {
  [videos, setVideos] = useState([]);
  [audioView, setAudioView] = useState(false);

  currentVideos = videos.slice();
  const webViewRef = useRef();
  // const [cacheBuster, setCacheBuster] = useState(Date.now());
  function handleReload() {
    //setCacheBuster(Date.now());
    //webViewRef.current.clearCache(true);
    webViewRef.current.reload();
  }

  function handleSelect(id) {
    console.log('selected video', id);
    setAudioView(!audioView);
    console.log(audioView);
  }

  function handleSubmit(videos) {
    setVideos(videos);
  }
  if (audioView) {
    return (
      <View style={styles.container}>
        <WebView
          style={styles.webview}
          source={{ uri: WEBVIEW_URL }}
          ref={(ref) => (webViewRef.current = ref)}
          incognito={true}
          onMessage={(event) => {
            console.log('received Message: ', event.nativeEvent.data); // Client received data
          }}
        />
        <Button
          title="Send Data"
          onPress={() => {
            webViewRef.current.postMessage('Just Luv');
          }}
        />
        <Button
          title="Reload WebView"
          onPress={() => {
            handleReload();
          }}
        />
        <StatusBar style="auto" />
      </View>
    );
  } else {
  }
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Pitch Perfect</Text>
      <VideoSearch onSubmit={handleSubmit} />
      <VideoList videos={currentVideos} onSelect={handleSelect} />
      <StatusBar style="auto" />
    </View>
  );
}

const windowsWidth = Dimensions.get('window').width;
const windowsHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgb(25, 25, 25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
    width: windowsWidth,
    margin: '50%',
    backgroundColor: 'purple',
  },
  text: {
    marginTop: windowsHeight / 10,
    color: 'white',
  },
});
