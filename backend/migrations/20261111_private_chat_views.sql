-- Viewer-private exact acknowledgements. No timestamps, device telemetry,
-- peer-facing receipts, sequence cutoffs or fabricated historical backfill.
ALTER TABLE chat_room_members ADD COLUMN membership_instance_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE chat_room_members ADD CONSTRAINT chat_room_members_view_instance_key UNIQUE (membership_instance_id);
-- Reject inconsistent legacy memberships instead of deduplicating/reassigning them.
ALTER TABLE chat_room_members ADD CONSTRAINT chat_room_members_view_owner_key UNIQUE (room_id,user_id);
ALTER TABLE chat_messages ADD COLUMN view_version uuid NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION chat_view_membership_identity() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.membership_instance_id := gen_random_uuid();
  ELSIF NEW.membership_instance_id IS DISTINCT FROM OLD.membership_instance_id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Membership identity is immutable; remove and re-add membership' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER chat_view_membership_identity BEFORE INSERT OR UPDATE ON chat_room_members
  FOR EACH ROW EXECUTE FUNCTION chat_view_membership_identity();

CREATE FUNCTION chat_view_message_version() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.view_version := gen_random_uuid();
  ELSIF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Message identity is immutable' USING ERRCODE='23514';
  ELSIF NEW.message IS DISTINCT FROM OLD.message OR NEW.attachment_id IS DISTINCT FROM OLD.attachment_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id OR NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.view_version IS DISTINCT FROM OLD.view_version THEN
    -- Even an explicit attempted version assignment gets a fresh server value.
    NEW.view_version := gen_random_uuid();
  END IF;
  RETURN NEW;
END
$body$;
CREATE TRIGGER chat_view_message_version BEFORE INSERT OR UPDATE ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION chat_view_message_version();

CREATE FUNCTION chat_view_attachment_version() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - 'created_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'created_at') THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE chat_messages SET view_version=gen_random_uuid() WHERE attachment_id=OLD.id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE chat_messages SET view_version=gen_random_uuid() WHERE attachment_id=NEW.id;
    RETURN NEW;
  END IF;
  RETURN OLD;
END
$body$;
CREATE TRIGGER chat_view_attachment_version AFTER INSERT OR UPDATE OR DELETE ON chat_attachments
  FOR EACH ROW EXECUTE FUNCTION chat_view_attachment_version();

CREATE TABLE chat_message_views (
  membership_instance_id uuid NOT NULL,
  message_id uuid NOT NULL,
  view_version uuid NOT NULL,
  CONSTRAINT chat_message_views_pkey PRIMARY KEY (membership_instance_id,message_id),
  CONSTRAINT chat_message_views_member_fkey FOREIGN KEY (membership_instance_id)
    REFERENCES chat_room_members(membership_instance_id) ON DELETE CASCADE,
  CONSTRAINT chat_message_views_message_fkey FOREIGN KEY (message_id)
    REFERENCES chat_messages(id) ON DELETE CASCADE
);
CREATE INDEX chat_message_views_message_idx ON chat_message_views(message_id);
CREATE INDEX chat_messages_view_room_idx ON chat_messages(room_id,company_id,sender_id,id);
