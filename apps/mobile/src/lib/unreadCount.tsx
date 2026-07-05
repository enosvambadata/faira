import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { conversations as conversationsApi, profile as profileApi } from './api';
import { getSession } from './session';
import { supabase, setRealtimeAuth } from './supabase';

interface UnreadCountContextValue {
  unreadCount: number;
  refresh: () => void;
}

const UnreadCountContext = createContext<UnreadCountContextValue>({ unreadCount: 0, refresh: () => {} });

export function useUnreadCount() {
  return useContext(UnreadCountContext);
}

// Mounted once inside TabNavigator (i.e. only while the user is signed in)
// so the Inbox tab badge and InboxScreen share one source of truth instead
// of each polling the API independently.
export function UnreadCountProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    conversationsApi
      .unreadCount()
      .then(res => setUnreadCount(res.count))
      .catch(() => {});
  }, []);

  useEffect(() => {
    profileApi
      .get()
      .then(p => setMyUserId(p.id))
      .catch(() => {});
    refresh();
  }, [refresh]);

  // Table-wide subscription (no conversation_id filter) — the RLS policy on
  // messages already restricts delivery to rows where the caller is a
  // participant, so this correctly sees every new message across every one
  // of the user's conversations without needing to know their ids upfront.
  useEffect(() => {
    if (!myUserId) return undefined;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const session = await getSession();
      if (!active || !session) return;
      setRealtimeAuth(session.accessToken);

      channel = supabase
        .channel('inbox-unread-count')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          payload => {
            const row = payload.new as Record<string, unknown>;
            if (row.sender_id !== myUserId) {
              setUnreadCount(current => current + 1);
            }
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [myUserId]);

  return <UnreadCountContext.Provider value={{ unreadCount, refresh }}>{children}</UnreadCountContext.Provider>;
}
