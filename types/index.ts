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

export interface MetaTemplateButton {
  type: string;        // "URL" | "QUICK_REPLY" | "PHONE_NUMBER" | "COPY_CODE"
  text: string;
  url?: string;
  url_type?: string;  // "STATIC" | "DYNAMIC"
  phone_number?: string;
  example?: string[];
}

export interface MetaTemplateComponent {
  type: string;       // "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  text?: string;
  format?: string;    // "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT"
  buttons?: MetaTemplateButton[];
  example?: {
    body_text?: string[][];
    header_text?: string[];
    header_handle?: string[];
  };
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
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
