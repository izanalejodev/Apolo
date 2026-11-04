import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { publicUrl } from '../lib/media';
import { Post } from '../lib/posts';

// Cuadrícula de 3 columnas del perfil. Al tocar, el detalle de la publicación
// (donde están los comentarios y, si es mía, el botón de borrar).
export function PostGrid({ posts }: { posts: Post[] }) {
  const router = useRouter();
  if (posts.length === 0) return null;
  return (
    <View style={styles.grid}>
      {posts.map((post) => (
        <Pressable
          key={post.id}
          style={styles.tile}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
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
