export interface Room {
  id: string;
  name: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  reactions: Record<string, string[]>;
  reply_to_id?: string | null;
  reply_to_username?: string | null;
  reply_to_content?: string | null;
  image_url?: string | null;
}

export interface ReadReceipt {
  messageId: string;
  username: string;
}
