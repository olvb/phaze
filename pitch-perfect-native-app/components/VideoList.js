import { StyleSheet, Image, Text, View, TouchableHighlight, FlatList, ScrollView } from 'react-native';
// TODO: doing a search like that will bear the risk that 'audio only'
// of the video doesn't exist when using YTDL to stream the audio later
export default function VideoList({ videos, onSelect }) {
  return (
    <ScrollView style={styles.viewContainer}>
      {videos.map((v) => {
        return (
          <View style={styles.imageContainer} key={v.id.videoId}>
            <TouchableHighlight key={v.id.videoId} style={styles.thumbnail} onPress={() => onSelect(v.id.videoId)}>
              <Image
                style={styles.thumbnail}
                source={{
                  uri: v.snippet.thumbnails.medium.url,
                }}
              />
            </TouchableHighlight>
            <View style={styles.infoCard}>
              <Text style={styles.infoTextTitle} onPress={() => onSelect(v.id.videoId)}>
                {v.snippet.title}
              </Text>
              <Text style={styles.infoTextSubtitle}>{new Date(v.snippet.publishedAt).toISOString().split('T')[0]}</Text>
              <Text style={styles.infoTextSubtitle}>{v.snippet.channelTitle}</Text>
              <Text style={styles.infoTextSubtitle}>{v.duration}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  viewContainer: {
    paddingTop: 50,
    width: '100%',
    rowGap: '5%',
  },
  imageContainer: {
    margin: '2%',
    width: '100%',
    flexDirection: 'row',
  },
  thumbnail: {
    width: 160,
    height: 90,

    flex: 1,
  },
  infoCard: {
    flex: 1,
    color: 'white',
    fontWeight: 'bold',
  },
  infoTextTitle: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: '3%',
    marginRight: '5%',
  },
  infoTextSubtitle: {
    color: 'white',
    fontSize: 12,
  },
});
