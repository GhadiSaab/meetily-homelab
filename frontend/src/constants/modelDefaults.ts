/**
 * Default model names for API transcription providers.
 */

export const DEFAULT_GROQ_MODEL = 'whisper-large-v3-turbo';
export const DEFAULT_SELF_HOSTED_WHISPER_MODEL = 'whisper-large-v3-turbo';

export const MODEL_DEFAULTS = {
  groq: DEFAULT_GROQ_MODEL,
  selfHostedWhisper: DEFAULT_SELF_HOSTED_WHISPER_MODEL,
} as const;
