import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLike } from '../lib/likes';
import { publicUrl } from '../lib/media';
import { FeedPost, timeAgo } from '../lib/posts';
import { useAuth } from '../providers/AuthProvider';
import { Avatar } from './Avatar';

// Una publicación: autor, foto, me gusta/comentarios y texto. Se usa en el
// feed y en la pantalla de detalle.
// memo: al cargar la página siguiente, las 20 ya pintadas no se vuelven a
// renderizar (sus props no han cambiado).
//
// inDetail: en la pantalla de detalle el icono de comentarios no navega
// (los comentarios ya están debajo).
export const FeedItem = memo(function FeedItem({
  post,
  inDetail = false,
}: {
  post: FeedPost;
  inDetail?: boolean;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const heart = useLike(session?.user.id, post.id, { liked: post.liked_by_me, count: post.like_count });
  const name = post.author.display_name || post.author.username;
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: post.author_id } });
  const openDetail = inDetail
    ? undefined
    : () => router.push({ pathname: '/post/[id]', params: { id: post.id } });

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

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={heart.toggle} hitSlop={8}>
          <Text style={[styles.icon, heart.liked && styles.liked]}>{heart.liked ? '♥' : '♡'}</Text>
          <Text style={styles.count}>{heart.count}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={openDetail} disabled={!openDetail} hitSlop={8}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.count}>{post.comment_count}</Text>
        </Pressable>
      </View>

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
  actions: { flexDirection: 'row', gap: 18, paddingHorizontal: 12, paddingTop: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 22 },
  liked: { color: '#e0245e' },
  count: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 15, lineHeight: 21, paddingHorizontal: 12, paddingTop: 6 },
});
