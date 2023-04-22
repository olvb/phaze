import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Dimensions, Button } from 'react-native';
import { useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import VideoList from './components/VideoList';
import VideoSearch from './components/VideoSearch';
import { WEBVIEW_URL, LOCAL_WEBVIEW_URL } from '@env';

export default function App() {
  [videos, setVideos] = useState([]);
  [selectedVideo, setSelectedVideo] = useState('');

  currentVideos = videos.slice();
  const webViewRef = useRef();
  // const [cacheBuster, setCacheBuster] = useState(Date.now());
  function handleReload() {
    //setCacheBuster(Date.now());
    //webViewRef.current.clearCache(true);
    webViewRef.current.reload();
  }

  function handleSelect(id) {
    setSelectedVideo(id);
    console.log('selected video id: ', id);
  }

  function handleSubmit(videos) {
    setSelectedVideo('');
    setVideos(videos);
  }

  if (selectedVideo !== '') {
    return (
      <View style={styles.container}>
        <VideoSearch onSubmit={handleSubmit} />
        <WebView
          style={styles.webview}
          source={{ uri: LOCAL_WEBVIEW_URL }} // needs to be replaced with the real url or when we test on iphone
          ref={(ref) => (webViewRef.current = ref)}
          incognito={true}
          onMessage={(event) => {
            console.log('received Message: ', event.nativeEvent.data); // Client received data
          }}
        />
        <Button
          title="Send Data"
          onPress={() => {
            webViewRef.current.postMessage(selectedVideo);
          }}
        />
        <Button
          title="Reload WebView"
          onPress={() => {
            handleReload();
          }}
        />

        <Button
          title="Go Back"
          onPress={() => {
            setSelectedVideo('');
          }}
        />
        <StatusBar style="auto" />
      </View>
    );
  } else if (currentVideos.length > 0) {
    return (
      <View style={styles.container}>
        <VideoSearch onSubmit={handleSubmit} />
        <VideoList videos={currentVideos} onSelect={handleSelect} />
        <StatusBar style="auto" />
      </View>
    );
  } else {
    return (
      <View style={styles.container}>
        <VideoSearch onSubmit={handleSubmit} />
        <Text style={styles.title}>Start by Searching for Tracks</Text>
        <Text style={styles.subtitle}>Find all artists and songs the web has to offer!</Text>
        <StatusBar style="auto" />
      </View>
    );
  }
}

const windowsWidth = Dimensions.get('window').width;
const windowsHeight = Dimensions.get('window').height;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgb(25, 25, 25)',
    alignItems: 'center',
    paddingBottom: 15,
  },
  webview: {
    flex: 1,
    width: windowsWidth,
    margin: '50%',
    backgroundColor: 'purple',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: windowsHeight / 2.5,
  },
  subtitle: {
    color: 'grey',
    fontSize: 11,
    marginTop: 10,
  },
});
