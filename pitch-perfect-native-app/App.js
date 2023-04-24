import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Dimensions, Button, Image } from 'react-native';
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
        <Text style={styles.trackTitle}>{selectedVideo ? selectedVideo.snippet.title : 'test track'}</Text>
        <Text style={styles.trackInterpreter}>{selectedVideo ? selectedVideo.snippet.channelTitle : 'test interpreter'}</Text>
        <WebView
          style={styles.webview}
          source={{ uri: LOCAL_WEBVIEW_URL }} // needs to be replaced with the tunnel url when we test on iphone
          ref={(ref) => (webViewRef.current = ref)}
          incognito={true}
          onMessage={(event) => {
            console.log('received Message: ', event.nativeEvent.data); // Client received data and feedbacked
          }}
          onLoad={() => webViewRef.current.postMessage(selectedVideoId)}
        />

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

        <Image style={styles.logo} source={require('./assets/pitchify-logo-truncated.png')}></Image>
        <Text style={styles.title}>Start by Searching for Tracks</Text>
        <Text style={styles.subtitle}>Find all artists and songs the web has to offer!</Text>
        <Button
          style={styles.debuggerButton}
          title="Load Test Track"
          onPress={() => {
            handleSelect('use_local_track');
          }}
        ></Button>
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
    margin: '2%',
    backgroundColor: 'rgb(25, 25, 25)',
  },
  logo: {
    marginTop: '40%',
    width: '40%',
    height: '30%',
    resizeMode: 'stretch',
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: '15%',
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
  debuggerButton: {
    alignSelf: 'flex-end',
    position: 'absolute',
    bottom: 35,
  },
});
