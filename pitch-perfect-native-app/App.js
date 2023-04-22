import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Dimensions, Button } from 'react-native';
import { useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import VideoList from './components/VideoList';
import VideoSearch from './components/VideoSearch';
import { WEBVIEW_URL, LOCAL_WEBVIEW_URL } from '@env';

export default function App() {
  [videos, setVideos] = useState([]);
  [selectedVideoId, setSelectedVideoId] = useState('');

  currentVideos = videos.slice();
  selectedVideo = videos.slice().find((v) => v.id.videoId === selectedVideoId);
  const webViewRef = useRef();
  // const [cacheBuster, setCacheBuster] = useState(Date.now());
  // function handleReload() {
  //   //setCacheBuster(Date.now());
  //   //webViewRef.current.clearCache(true);
  //   webViewRef.current.reload();
  // }

  function handleSelect(id) {
    setSelectedVideoId(id);
    console.log('selected video id: ', id);
  }

  function handleSubmit(videos) {
    setSelectedVideoId('');
    setVideos(videos);
  }

  if (selectedVideoId !== '') {
    return (
      <View style={styles.container}>
        <VideoSearch onSubmit={handleSubmit} />
        <Text style={styles.trackTitle}>{selectedVideo.snippet.title}</Text>
        <Text style={styles.trackInterpreter}>{selectedVideo.snippet.channelTitle}</Text>
        <WebView
          style={styles.webview}
          source={{ uri: LOCAL_WEBVIEW_URL }} // needs to be replaced with the real url or when we test on iphone
          ref={(ref) => (webViewRef.current = ref)}
          incognito={true}
          onMessage={(event) => {
            console.log('received Message: ', event.nativeEvent.data); // Client received data
          }}
        />
        {/* <Button
          title="Send Data"
          onPress={() => {
            webViewRef.current.postMessage(selectedVideo);
          }}
        /> */}

        <Button
          title="Go Back"
          onPress={() => {
            setSelectedVideoId('');
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
    margin: '10%',
    backgroundColor: 'rgb(25, 25, 25)',
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
  trackTitle: {
    color: 'white',
    fontSize: 25,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginRight: 20,
    marginTop: 20,
  },
  trackInterpreter: {
    color: 'grey',
    fontSize: 13,
    marginTop: 10,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
});
