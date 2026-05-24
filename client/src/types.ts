export interface Room {
  id: string;
  name: string;
  is_dm: boolean;
  dm_with?: string;
  dm_with_image?: string;
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
}

export interface ReadReceipt {
  messageId: string;
  username: string;
}
