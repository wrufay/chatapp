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
}

export interface ReadReceipt {
  messageId: string;
  username: string;
}
