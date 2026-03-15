import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'

const MAX_CHARS = 500

export default function Feed({ embedded = false }) {
  const { profile } = useApp()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [photos, setPhotos] = useState([]) // { file, preview, url }
  const [posting, setPosting] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [filter, setFilter] = useState('everyone')
  const [likedIds, setLikedIds] = useState(new Set())
  const textareaRef = useRef()
  const fileRef = useRef()

  useEffect(() => { loadPosts() }, [filter])

  async function loadPosts() {
    setLoading(true)
    let query = supabase
      .from('posts')
      .select('*, profiles(id, full_name, username, avatar_color, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter === 'following') {
      const { data: follows } = await supabase
        .from('friendships').select('following_id').eq('follower_id', profile.id)
      const ids = (follows || []).map(f => f.following_id)
      ids.push(profile.id)
      query = query.in('user_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])
    }

    const { data } = await query
    setPosts(data || [])

    const { data: likes } = await supabase
      .from('post_likes').select('post_id').eq('user_id', profile.id)
    setLikedIds(new Set((likes || []).map(l => l.post_id)))
    setLoading(false)
  }

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const remaining = 4 - photos.length
    const toAdd = files.slice(0, remaining)
    const newPhotos = toAdd.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      url: null,
    }))
    setPhotos(prev => [...prev, ...newPhotos])
  }

  function removePhoto(idx) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function uploadPhotos() {
    const uploaded = []
    for (const photo of photos) {
      if (photo.url) { uploaded.push(photo.url); continue }
      const ext = photo.file.name.split('.').pop()
      const path = `${profile.id}/posts/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('proofs').upload(path, photo.file)
      if (error) continue
      const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(path)
      uploaded.push(publicUrl)
    }
    return uploaded
  }

  async function submitPost() {
    if (!content.trim() && photos.length === 0) return
    if (posting) return
    setPosting(true)
    let photoUrls = []
    if (photos.length > 0) {
      setUploadingPhoto(true)
      photoUrls = await uploadPhotos()
      setUploadingPhoto(false)
    }
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id,
      content: content.trim() || '📸',
      photo_urls: photoUrls,
    })
    if (!error) {
      setContent('')
      setPhotos([])
      loadPosts()
    }
    setPosting(false)
  }

  async function toggleLike(postId) {
    const liked = likedIds.has(postId)
    const newSet = new Set(likedIds)
    if (liked) {
      newSet.delete(postId)
      await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', profile.id)
    } else {
      newSet.add(postId)
      await supabase.from('post_likes').insert({ post_id: postId, user_id: profile.id })
    }
    setLikedIds(newSet)
    setPosts(ps => ps.map(p => p.id === postId ? { ...p, likes_count: p.likes_count + (liked ? -1 : 1) } : p))
  }

  async function deletePost(postId) {
    await supabase.from('posts').delete().eq('id', postId)
    setPosts(ps => ps.filter(p => p.id !== postId))
  }

  const canPost = (content.trim().length > 0 || photos.length > 0) && !posting

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-kanit font-bold italic uppercase text-4xl tracking-tight">FEED</h1>
        <div className="flex gap-2">
          {['everyone', 'following'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-2xl text-sm font-medium capitalize transition-all ${
                filter === f ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Compose box */}
      {!embedded && (
      <div className="bg-card border border-border rounded-3xl p-4 shadow-card">
        <div className="flex gap-3">
          <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size="md" />
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPost() }}
              placeholder={`What did you crush today, @${profile?.username || profile?.full_name?.split(' ')[0]}?`}
              rows={3}
              className="w-full bg-bg border border-border rounded-2xl px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-lime resize-none transition-colors"
            />

            {/* Photo previews */}
            {photos.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden border border-border group">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xl"
                    >×</button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border border-dashed border-border flex items-center justify-center text-muted hover:text-white hover:border-lime transition-colors text-2xl"
                  >+</button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3">
                {/* Photo button */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={photos.length >= 4}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-lime disabled:opacity-30 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Photo {photos.length > 0 ? `(${photos.length}/4)` : ''}
                </button>
                <span className={`text-xs ${content.length > MAX_CHARS * 0.9 ? 'text-lime' : 'text-muted'}`}>
                  {content.length}/{MAX_CHARS}
                </span>
              </div>
              <button
                onClick={submitPost}
                disabled={!canPost}
                className="bg-lime hover:bg-lime-dim text-bg disabled:opacity-40 font-kanit font-semibold text-sm px-5 py-2 rounded-2xl transition-all"
              >
                {uploadingPhoto ? 'UPLOADING…' : posting ? 'POSTING…' : 'POST'}
              </button>
            </div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={handlePhotoSelect} />
      </div>

      )}

      {/* Posts */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-card border border-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-muted text-sm">
          {filter === 'following' ? 'No posts from people you follow yet.' : 'No posts yet. Be the first!'}
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              isMe={post.user_id === profile.id}
              liked={likedIds.has(post.id)}
              onLike={() => toggleLike(post.id)}
              onDelete={() => deletePost(post.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({ post, isMe, liked, onLike, onDelete }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const timeAgo = getTimeAgo(post.created_at)
  const hasPhotos = post.photo_urls?.length > 0

  return (
    <div className="bg-card border border-border rounded-3xl p-4 shadow-card">
      <div className="flex gap-3">
        <Link to={`/profile/${post.profiles?.username || post.user_id}`}>
          <Avatar name={post.profiles?.full_name} avatarUrl={post.profiles?.avatar_url} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <Link to={`/profile/${post.profiles?.username || post.user_id}`}
                className="font-kanit font-semibold text-sm text-white hover:text-lime transition-colors">
                {post.profiles?.full_name}
              </Link>
              {post.profiles?.username && (
                <span className="text-muted text-xs">@{post.profiles.username}</span>
              )}
              <span className="text-muted text-xs">· {timeAgo}</span>
            </div>
            {isMe && (
              <div className="flex-shrink-0">
                {showConfirm ? (
                  <div className="flex items-center gap-2">
                    <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    <button onClick={() => setShowConfirm(false)} className="text-xs text-muted hover:text-white">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setShowConfirm(true)} className="text-muted hover:text-white text-sm px-1">···</button>
                )}
              </div>
            )}
          </div>

          {post.content && post.content !== '📸' && (
            <p className="text-sm text-gray-200 mt-2 leading-relaxed whitespace-pre-wrap break-words">
              {formatContent(post.content)}
            </p>
          )}

          {/* Photo grid */}
          {hasPhotos && (
            <div className={`mt-3 grid gap-1.5 rounded-2xl overflow-hidden ${
              post.photo_urls.length === 1 ? 'grid-cols-1' :
              post.photo_urls.length === 2 ? 'grid-cols-2' :
              post.photo_urls.length === 3 ? 'grid-cols-3' :
              'grid-cols-2'
            }`}>
              {post.photo_urls.map((url, i) => (
                <button key={i} onClick={() => setLightbox(url)}
                  className={`overflow-hidden ${post.photo_urls.length === 4 && i === 0 ? 'row-span-2' : ''}`}
                >
                  <img src={url} alt="" className={`w-full object-cover hover:opacity-90 transition-opacity ${
                    post.photo_urls.length === 1 ? 'max-h-80' : 'h-32'
                  }`} />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 mt-3">
            <button onClick={onLike}
              className={`flex items-center gap-1.5 text-xs transition-colors ${liked ? 'text-red-400' : 'text-muted hover:text-red-400'}`}>
              <span className="text-base">{liked ? '❤️' : '🤍'}</span>
              {post.likes_count > 0 && <span>{post.likes_count}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-2xl object-contain" />
          <button className="absolute top-4 right-4 text-white text-3xl">×</button>
        </div>
      )}
    </div>
  )
}

export function Avatar({ name, avatarUrl, size = 'md' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-14 h-14 text-lg' }
  const sizeClass = sizes[size]
  const initial = name?.[0]?.toUpperCase() || '?'

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || ''}
        className={sizeClass + ' rounded-2xl object-cover flex-shrink-0 border border-border'}
        onError={e => {
          e.currentTarget.outerHTML = '<div class="' + sizeClass + ' rounded-2xl flex items-center justify-center font-kanit font-bold flex-shrink-0 bg-soft border border-border text-white">' + initial + '</div>'
        }}
      />
    )
  }

  return (
    <div className={sizeClass + ' rounded-2xl flex items-center justify-center font-kanit font-bold flex-shrink-0 bg-soft border border-border text-white'}>
      {initial}
    </div>
  )
}

function formatContent(text) {
  return text.split(/(@\w+|#\w+)/g).map((part, i) => {
    if (part.startsWith('@')) return <Link key={i} to={`/profile/${part.slice(1)}`} className="text-lime hover:underline">{part}</Link>
    if (part.startsWith('#')) return <span key={i} className="text-lime">{part}</span>
    return part
  })
}

export function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}
