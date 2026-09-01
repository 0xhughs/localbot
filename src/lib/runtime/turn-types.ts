export type TurnMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: TurnToolCall[];
};

export type TurnToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type TurnInput = {
  messages: TurnMessage[];
  allowNetwork: boolean;
};

export type TurnOutput =
  | { ok: true; content: string; toolCalls: TurnToolCall[] }
  | { ok: false; error: string };
