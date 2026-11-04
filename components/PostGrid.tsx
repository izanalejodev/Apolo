import { Image, Pressable, StyleSheet, View } from 'react-native';
import { publicUrl } from '../lib/media';
import { Post } from '../lib/posts';

// Cuadrícula de 3 columnas del perfil
export function PostGrid({ posts, onLongPress }: { posts: Post[]; onLongPress?: (post: Post) => void }) {
  if (posts.length === 0) return null;
  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <Pressable
          key={post.id}
          style={styles.tile}
          onLongPress={onLongPress ? () => onLongPress(post) : undefined}
        >
          <Image source={{ uri: publicUrl('posts', post.media_path) }} style={styles.tileImage} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -1 },
  tile: { width: '33.333%', aspectRatio: 1, padding: 1 },
  tileImage: { flex: 1, backgroundColor: '#eee' },
});
