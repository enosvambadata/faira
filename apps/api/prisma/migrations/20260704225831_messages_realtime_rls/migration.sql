-- Enable Supabase Realtime (Postgres Changes) for the messages table so
-- clients can subscribe directly via supabase-js instead of polling our API.
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Realtime subscriptions authenticate with the end user's own JWT (not our
-- server's Prisma connection, which uses a role that bypasses RLS entirely),
-- so without a policy any authenticated user could subscribe to every
-- conversation's messages. Restrict SELECT to actual participants.
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their conversation's messages"
ON messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
  )
);
