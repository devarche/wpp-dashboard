export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  profile_pic: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  last_message_at: string | null;
  last_message: string | null;
  unread_count: number;
  status: "open" | "closed" | "pending";
  created_at: string;
  updated_at: string;
  contact: Contact | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  wamid: string | null;
  direction: "inbound" | "outbound";
  type: string;
  content: Record<string, unknown>;
  status: string;
  created_at: string;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}

export interface MetaTemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: unknown[];
}

export interface Campaign {
  id: string;
  name: string;
  template_id: string | null;
  status: "draft" | "running" | "paused" | "completed";
  sent_count: number;
  delivered_count: number;
  read_count: number;
  created_at: string;
  scheduled_at: string | null;
}
