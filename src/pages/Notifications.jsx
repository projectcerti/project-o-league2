import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useApp } from '../App'
import { Avatar, getTimeAgo } from './Feed'

const _cache = { notifications: null }

export default function Notifications() {
  const { profile } = useApp()
  const [notifications, setNotifications] = useState(_cache.notifications || [])
  const [loading, setLoading] = useState(!_cache.notifications)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('notifications')
      .select('*, profiles!notifications_actor_id_fkey(id, full_name, username, avatar_url)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
    _cache.notifications = data || []
    setNotifications(data || [])
    // Mark all as read
    await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false)
    setLoading(false)
  }

  const typeIcon = { like: '❤️', comment: '💬', follow: '👤', post: '📣', log: '📋', overtaken: '⚡' }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-2 pt-2 animate-pulse">
      {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-card rounded-3xl" />)}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-2 pt-1 fade-up">
      <h1 className="font-kanit font-bold italic uppercase text-2xl text-white py-1">NOTIFICATIONS</h1>

      {notifications.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-3xl p-10 text-center">
          <p className="text-muted font-dm text-sm">No notifications yet.</p>
        </div>
      ) : (
        notifications.map(n => (
          <div key={n.id} className={`bg-card border rounded-3xl p-4 flex items-start gap-3 ${!n.read ? 'border-lime/20 bg-lime/5' : 'border-border'}`}>
            <Avatar name={n.profiles?.full_name} avatarUrl={n.profiles?.avatar_url} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-dm leading-snug">
                <span className="mr-1">{typeIcon[n.type] || '🔔'}</span>
                {n.message}
              </p>
              <p className="text-xs text-muted font-dm mt-0.5">{getTimeAgo(n.created_at)}</p>
            </div>
            {!n.read && <div className="w-2 h-2 rounded-full bg-lime flex-shrink-0 mt-1.5" />}
          </div>
        ))
      )}
    </div>
  )
}
