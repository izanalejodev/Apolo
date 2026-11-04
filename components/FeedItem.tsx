import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { publicUrl } from '../lib/media';
import { FeedPost, timeAgo } from '../lib/posts';
import { Avatar } from './Avatar';

// Una publicación del feed: autor, foto y texto.
// memo: al cargar la página siguiente, las 20 ya pintadas no se vuelven a
// renderizar (sus props no han cambiado).
export const FeedItem = memo(function FeedItem({ post }: { post: FeedPost }) {
  const router = useRouter();
  const name = post.author.display_name || post.author.username;
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: post.author_id } });

  return (
    <View style={styles.item}>
      <Pressable style={styles.header} onPress={openAuthor}>
        <Avatar path={post.author.avatar_path} name={name} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.muted}>{timeAgo(post.created_at)}</Text>
        </View>
      </Pressable>

      {/* Cuadrada y recortada: no guardamos el ancho/alto de la foto, así que
          no sabemos su proporción antes de descargarla. Ver notas. */}
      <Image source={{ uri: publicUrl('posts', post.media_path) }} style={styles.image} />

      {post.caption && (
        <Text style={styles.caption}>
          <Text style={styles.name} onPress={openAuthor}>{post.author.username} </Text>
          {post.caption}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  item: { marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  name: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#666', fontSize: 12 },
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#eee' },
  caption: { fontSize: 15, lineHeight: 21, paddingHorizontal: 12, paddingTop: 8 },
});
