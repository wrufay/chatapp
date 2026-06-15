export interface Room {
  id: string;
  name: string;
  is_dm: boolean;
  is_group: boolean;
  dm_with?: string;
  dm_with_image?: string;
  dm_with_id?: string;
}

export interface User {
  id: string;
  username: string;
  image_url: string | null;
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
