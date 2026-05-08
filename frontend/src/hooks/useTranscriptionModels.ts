import { useState, useCallback } from 'react';

export interface ModelOption {
  provider: 'groq' | 'selfHostedWhisper';
  name: string;
  displayName: string;
  size_mb: number;
}

interface TranscriptModelConfig {
  provider?: string;
  model?: string;
}

export function useTranscriptionModels(transcriptModelConfig: TranscriptModelConfig | undefined) {
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [loadingModels, setLoadingModels] = useState(false);

  const fetchModels = useCallback(async () => {
    setLoadingModels(true);

    const provider = transcriptModelConfig?.provider === 'selfHostedWhisper'
      ? 'selfHostedWhisper'
      : 'groq';
    const model = transcriptModelConfig?.model || 'whisper-large-v3-turbo';

    const onlyModel: ModelOption = {
      provider,
      name: model,
      displayName: provider === 'groq' ? `Groq: ${model}` : `Self-hosted Whisper: ${model}`,
      size_mb: 0,
    };

    setAvailableModels([onlyModel]);
    setSelectedModelKey(`${provider}:${model}`);
    setLoadingModels(false);
  }, [transcriptModelConfig]);

  const resetSelection = useCallback(() => {
    setSelectedModelKey('');
  }, []);

  return {
    availableModels,
    selectedModelKey,
    setSelectedModelKey,
    loadingModels,
    fetchModels,
    resetSelection,
  };
}
