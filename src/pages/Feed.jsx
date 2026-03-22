import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'

const MAX_CHARS = 500

const _feedCache = { posts: [], likedIds: [] }

export default function Feed({ embedded = false }) {
  const { profile } = useApp()
  const [posts, setPosts]           = useState(_feedCache.posts)
  const [loading, setLoading]       = useState(_feedCache.posts.length === 0)
  const [content, setContent]       = useState('')
  const [photos, setPhotos]         = useState([])
  const [posting, setPosting]       = useState(false)
  const [filter, setFilter]         = useState('everyone')
  const [likedIds, setLikedIds]     = useState(new Set(_feedCache.likedIds))
  const textareaRef = useRef()
  const fileRef     = useRef()

  useEffect(() => { loadPosts() }, [filter])

  async function loadPosts() {
    let query = supabase.from('posts')
      .select('*, profiles(id, full_name, username, avatar_url), comment_count')
      .order('created_at', { ascending: false })
      .limit(embedded ? 10 : 50)

    if (filter === 'following') {
      const { data: follows } = await supabase.from('friendships').select('following_id').eq('follower_id', profile.id)
      const ids = (follows || []).map(f => f.following_id)
      ids.push(profile.id)
      query = query.in('user_id', ids)
    }

    const { data } = await query
    setPosts(data || [])

    const { data: liked } = await supabase.from('post_likes').select('post_id').eq('user_id', profile.id)
    const likedSet = new Set((liked || []).map(l => l.post_id))
    _feedCache.posts = data || []
    _feedCache.likedIds = [...likedSet]
    setLikedIds(likedSet)
    setLoading(false)
  }

  async function handlePhotoSelect(e) {
    const files = Array.from(e.target.files || [])
    const previews = files.slice(0, 4 - photos.length).map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPhotos(prev => [...prev, ...previews])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function uploadPhoto(file) {
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/posts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('proofs').upload(path, file)
    if (error) return null
    const { data: { publicUrl } } = supabase.storage.from('proofs').getPublicUrl(path)
    return publicUrl
  }

  async function post() {
    if (!content.trim() && photos.length === 0) return
    setPosting(true)
    const urls = []
    for (const { file } of photos) {
      const url = await uploadPhoto(file)
      if (url) urls.push(url)
    }
    await supabase.from('posts').insert({
      user_id: profile.id,
      content: content.trim().slice(0, 500),
      photo_urls: urls,
    })

    // Notify followers who have notify=true
    const { data: notifyFollowers } = await supabase.from('friendships')
      .select('follower_id').eq('following_id', profile.id).eq('notify', true)
    if (notifyFollowers?.length) {
      await supabase.from('notifications').insert(
        notifyFollowers.map(f => ({
          user_id: f.follower_id,
          actor_id: profile.id,
          type: 'post',
          message: `${profile.full_name} posted something new`,
        }))
      )
    }

    setContent(''); setPhotos([]); setPosting(false); loadPosts()
  }

  return (
    <div className={embedded ? "space-y-3" : "max-w-2xl mx-auto space-y-3 pt-1 pb-2 fade-up"}>

      {!embedded && (
        <>
          {/* Filter */}
          <div className="flex gap-2">
            {['everyone','following'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-2xl text-sm font-kanit font-semibold uppercase transition-all ${filter === f ? 'bg-lime text-bg' : 'bg-card border border-border text-muted hover:text-white'}`}>
                {f === 'everyone' ? 'Everyone' : 'Following'}
              </button>
            ))}
          </div>

          {/* Compose */}
          <div className="bg-card border border-border rounded-3xl p-4 space-y-3">
            <div className="flex gap-3">
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size="md" />
              <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Share something with the league…"
                rows={2}
                className="flex-1 bg-soft border border-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-lime/40 resize-none font-dm" />
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0">
                    <img src={p.preview} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {photos.length < 4 && (
                  <button onClick={() => fileRef.current?.click()}
                    className="text-muted hover:text-lime text-sm font-dm transition-colors flex items-center gap-1">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    Photo
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
                <span className="text-xs text-muted font-dm self-center">{content.length}/{MAX_CHARS}</span>
              </div>
              <button onClick={post} disabled={posting || (!content.trim() && photos.length === 0)}
                className="bg-lime text-bg font-kanit font-semibold uppercase text-sm px-5 py-2 rounded-2xl disabled:opacity-40 active:scale-95 transition-all shadow-lime-sm">
                {posting ? 'Posting…' : 'POST'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Posts */}
      {loading ? (
        <div className="space-y-3 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-card rounded-3xl" />)}</div>
      ) : posts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center">
          <p className="text-muted font-dm text-sm">No posts yet — be the first!</p>
        </div>
      ) : (
        posts.map(post => (
          <PostCard key={post.id} post={post} profile={profile} likedIds={likedIds}
            onLike={async () => {
              const liked = likedIds.has(post.id)
              if (liked) {
                // Optimistic UI update
                setLikedIds(prev => { const s = new Set(prev); s.delete(post.id); return s })
                setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes_count: (p.likes_count || 1) - 1 } : p))
                const { error } = await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', profile.id)
                if (error) {
                  console.error('Unlike failed:', error)
                  // Revert on failure
                  setLikedIds(prev => new Set([...prev, post.id]))
                  setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p))
                }
              } else {
                // Optimistic UI update
                setLikedIds(prev => new Set([...prev, post.id]))
                setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p))
                const { error } = await supabase.from('post_likes').insert({ post_id: post.id, user_id: profile.id })
                if (error) {
                  console.error('Like failed:', error)
                  // Revert on failure
                  setLikedIds(prev => { const s = new Set(prev); s.delete(post.id); return s })
                  setPosts(prev => prev.map(p => p.id === post.id ? { ...p, likes_count: (p.likes_count || 1) - 1 } : p))
                } else if (post.user_id !== profile.id) {
                  // Notify post owner (fire and forget is fine for notifications)
                  supabase.from('notifications').insert({
                    user_id: post.user_id, actor_id: profile.id,
                    type: 'like', post_id: post.id,
                    message: `${profile.full_name} liked your post`,
                  })
                }
              }
            }}
            onComment={() => loadPosts()}
          />
        ))
      )}
    </div>
  )
}

function PostCard({ post, profile, likedIds, onLike, onComment }) {
  const [showAllComments, setShowAllComments] = useState(false)
  const [comments, setComments]         = useState([])
  const [commentText, setCommentText]   = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [posting, setPosting]           = useState(false)
  const [showConfirm, setShowConfirm]   = useState(false)
  const liked    = likedIds.has(post.id)
  const isOwn    = post.user_id === profile.id
  const hasPhotos = post.photo_urls?.length > 0
  const [lightbox, setLightbox] = useState(null)

  const commentCount = comments.length || post.comment_count || 0
  const likesCount = post.likes_count || 0

  // Always load comments on mount
  useEffect(() => {
    loadComments()
  }, [])

  async function loadComments() {
    setLoadingComments(true)
    const { data } = await supabase.from('post_comments')
      .select('*, profiles(id, full_name, username, avatar_url)')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
    setComments(data || [])
    setLoadingComments(false)
  }

  async function submitComment() {
    if (!commentText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('post_comments').insert({
      post_id: post.id, user_id: profile.id, content: commentText.trim().slice(0, 300)
    })
    if (error) {
      console.error('Comment failed:', error)
      setPosting(false)
      return
    }
    // Notify post owner
    if (post.user_id !== profile.id) {
      supabase.from('notifications').insert({
        user_id: post.user_id, actor_id: profile.id,
        type: 'comment', post_id: post.id,
        message: `${profile.full_name} commented on your post`,
      })
    }
    setCommentText('')
    setPosting(false)
    await loadComments()
    onComment()
  }

  async function deletePost() {
    await supabase.from('posts').delete().eq('id', post.id)
    onComment()
  }

  // Show first 3 comments by default, all if expanded
  const visibleComments = showAllComments ? comments : comments.slice(0, 3)
  const hiddenCount = comments.length - 3

  return (
    <div className="bg-card border border-border rounded-3xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <Link to={`/profile/${post.profiles?.username || post.profiles?.id}`} className="flex items-center gap-3 group">
            <Avatar name={post.profiles?.full_name} avatarUrl={post.profiles?.avatar_url} size="md" />
            <div>
              <p className="font-kanit font-semibold text-sm text-white group-hover:text-lime transition-colors">{post.profiles?.full_name}</p>
              <p className="text-muted text-xs font-dm">{getTimeAgo(post.created_at)}</p>
            </div>
          </Link>
          {isOwn && (
            showConfirm ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-muted font-dm">Delete?</span>
                <button onClick={deletePost} className="text-red-400 text-xs font-dm hover:underline">Yes</button>
                <button onClick={() => setShowConfirm(false)} className="text-muted text-xs font-dm hover:underline">No</button>
              </div>
            ) : (
              <button onClick={() => setShowConfirm(true)} className="text-muted hover:text-white text-sm px-1">···</button>
            )
          )}
        </div>

        {post.content && post.content !== '📸' && (
          <p className="text-sm text-gray-200 mb-3 leading-relaxed whitespace-pre-wrap break-words">{formatContent(post.content)}</p>
        )}
      </div>

      {hasPhotos && (
        <div className={`grid gap-0.5 ${post.photo_urls.length === 1 ? 'grid-cols-1' : post.photo_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {post.photo_urls.map((url, i) => (
            <button key={i} onClick={() => setLightbox(url)} className="overflow-hidden">
              <img src={url} alt="" className={`w-full object-cover ${post.photo_urls.length === 1 ? 'max-h-80' : 'h-36'}`} />
            </button>
          ))}
        </div>
      )}

      {/* Like & comment counts bar */}
      {(likesCount > 0 || commentCount > 0) && (
        <div className="px-4 pt-2.5 pb-0 flex items-center gap-3 text-xs text-muted font-dm">
          {likesCount > 0 && (
            <span>❤️ {likesCount} {likesCount === 1 ? 'like' : 'likes'}</span>
          )}
          {commentCount > 0 && (
            <span>💬 {commentCount} {commentCount === 1 ? 'comment' : 'comments'}</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 py-2.5 flex items-center gap-4 border-t border-border/50 mt-2">
        <button onClick={onLike}
          className={`flex items-center gap-1.5 text-xs font-dm transition-colors ${liked ? 'text-red-400' : 'text-muted hover:text-red-400'}`}>
          <span className="text-base">{liked ? '❤️' : '🤍'}</span>
          {liked ? 'Liked' : 'Like'}
        </button>
        <button onClick={() => setShowAllComments(v => !v)}
          className="flex items-center gap-1.5 text-xs font-dm text-muted hover:text-lime transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Comment
        </button>
      </div>

      {/* Comments — always visible if there are comments */}
      {(comments.length > 0 || showAllComments) && (
        <div className="border-t border-border/50 px-4 pb-4 space-y-2.5 pt-3">
          {loadingComments && comments.length === 0 ? (
            <p className="text-muted text-xs font-dm">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-muted text-xs font-dm">No comments yet. Be the first!</p>
          ) : (
            <>
              {visibleComments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.profiles?.full_name} avatarUrl={c.profiles?.avatar_url} size="sm" />
                  <div className="flex-1 bg-soft rounded-2xl px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-xs font-kanit font-semibold text-white">{c.profiles?.full_name}</p>
                      <p className="text-xs text-muted font-dm">{getTimeAgo(c.created_at)}</p>
                    </div>
                    <p className="text-xs text-gray-300 font-dm mt-0.5">{c.content}</p>
                  </div>
                </div>
              ))}
              {!showAllComments && hiddenCount > 0 && (
                <button onClick={() => setShowAllComments(true)}
                  className="text-xs text-lime font-dm hover:underline pl-10">
                  View {hiddenCount} more {hiddenCount === 1 ? 'comment' : 'comments'}
                </button>
              )}
            </>
          )}
          {/* Comment input — always visible when comments section is shown, or when user clicked Comment */}
          {showAllComments && (
            <div className="flex gap-2 pt-1">
              <Avatar name={profile?.full_name} avatarUrl={profile?.avatar_url} size="sm" />
              <div className="flex-1 flex gap-2">
                <input value={commentText} onChange={e => setCommentText(e.target.value.slice(0, 300))}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submitComment()}
                  placeholder="Add a comment…"
                  className="flex-1 bg-soft border border-border rounded-2xl px-3 py-2 text-xs text-white placeholder-muted focus:outline-none focus:border-lime/40 font-dm" />
                <button onClick={submitComment} disabled={posting || !commentText.trim()}
                  className="bg-lime text-bg font-kanit font-semibold uppercase text-xs px-3 py-2 rounded-2xl disabled:opacity-40">
                  {posting ? '…' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
      <img src={avatarUrl} alt={name || ''}
        className={`${sizeClass} rounded-2xl object-cover flex-shrink-0 border border-border`}
        onError={e => { e.currentTarget.outerHTML = `<div class="${sizeClass} rounded-2xl flex items-center justify-center font-kanit font-bold flex-shrink-0 bg-soft border border-border text-white">${initial}</div>` }} />
    )
  }
  return (
    <div className={`${sizeClass} rounded-2xl flex items-center justify-center font-kanit font-bold flex-shrink-0 bg-soft border border-border text-white`}>
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
