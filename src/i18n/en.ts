const en = {
  // App
  appTitle: "DevPilot",

  // Sidebar
  newChat: "New Chat",
  recentChats: "Recent",
  gallery: "Gallery",
  scheduler: "Scheduler",
  bridge: "Bridge",
  settings: "Settings",

  // Header modes
  "mode.code": "Code",
  "mode.plan": "Plan",
  "mode.ask": "Ask",

  // Chat
  chatPlaceholder: "Ask DevPilot anything...",
  send: "Send",
  stop: "Stop",

  // Messages
  thinking: "Thinking...",
  toolCall: "Tool Call",
  error: "Error",

  // Settings
  settingsTitle: "Settings",
  providers: "Providers",
  appearance: "Appearance",
  sandbox: "Sandbox",
  shortcuts: "Shortcuts",
  advanced: "Advanced",

  // General
  save: "Save",
  cancel: "Cancel",
  delete: "Delete",
  confirm: "Confirm",
  loading: "Loading...",
  noResults: "No results",
} as const;

export type I18nKey = keyof typeof en;
export default en;
