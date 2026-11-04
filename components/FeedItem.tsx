import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLike } from '../lib/likes';
import { publicUrl } from '../lib/media';
import { usePostStats } from '../lib/postStats';
import { FeedPost, feedAspectRatio, timeAgo } from '../lib/posts';
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
  const heart = useLike(session?.user.id, post);
  // Mismo almacén que el corazón: si comentas en el detalle, aquí se ve
  const { commentCount } = usePostStats(post);
  const name = post.author.display_name || post.author.username;
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: post.author_id } });
  const openDetail = inDetail
    ? undefined
    : () => router.push({ pathname: '/post/[id]', params: { id: post.id } });
  const openLikers = () => router.push({ pathname: '/likes', params: { postId: post.id } });

  return (
    <View style={styles.item}>
      <Pressable style={styles.header} onPress={openAuthor}>
        <Avatar path={post.author.avatar_path} name={name} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.muted}>{timeAgo(post.created_at)}</Text>
        </View>
      </Pressable>

      {/* Con la proporción guardada al publicar (width/height), así el hueco
          ya tiene su tamaño antes de que llegue la foto y no hay saltos.
          Las publicaciones antiguas, sin tamaño, salen cuadradas. */}
      <Image
        source={{ uri: publicUrl('posts', post.media_path) }}
        style={[styles.image, { aspectRatio: feedAspectRatio(post) }]}
        resizeMode="cover"
      />

      <View style={styles.actions}>
        {/* El corazón da like; el número abre quién lo ha dado (como Instagram) */}
        <View style={styles.action}>
          <Pressable onPress={heart.toggle} hitSlop={8}>
            <Text style={[styles.icon, heart.liked && styles.liked]}>{heart.liked ? '♥' : '♡'}</Text>
          </Pressable>
          <Pressable onPress={openLikers} disabled={heart.count === 0} hitSlop={8}>
            <Text style={styles.count}>{heart.count}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.action} onPress={openDetail} disabled={!openDetail} hitSlop={8}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.count}>{commentCount}</Text>
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
  image: { width: '100%', backgroundColor: '#eee' },
  actions: { flexDirection: 'row', gap: 18, paddingHorizontal: 12, paddingTop: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 22 },
  liked: { color: '#e0245e' },
  count: { fontSize: 15, fontWeight: '600' },
  caption: { fontSize: 15, lineHeight: 21, paddingHorizontal: 12, paddingTop: 6 },
});
