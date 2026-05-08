import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { load } from '@tauri-apps/plugin-store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';


export interface TranscriptModelProps {
    provider: 'groq' | 'selfHostedWhisper';
    model: string;
    apiKey?: string | null;
}

export interface TranscriptSettingsProps {
    transcriptModelConfig: TranscriptModelProps;
    setTranscriptModelConfig: (config: TranscriptModelProps) => void;
    onModelSelect?: () => void;
}

export function TranscriptSettings({ transcriptModelConfig, setTranscriptModelConfig }: TranscriptSettingsProps) {
    const [apiKey, setApiKey] = useState<string | null>(transcriptModelConfig.apiKey || null);
    const [showApiKey, setShowApiKey] = useState<boolean>(false);
    const [isApiKeyLocked, setIsApiKeyLocked] = useState<boolean>(true);
    const [isLockButtonVibrating, setIsLockButtonVibrating] = useState<boolean>(false);
    const [uiProvider, setUiProvider] = useState<TranscriptModelProps['provider']>(transcriptModelConfig.provider);
    const [whisperEndpoint, setWhisperEndpoint] = useState('');
    const [saved, setSaved] = useState(false);

    // Sync uiProvider when backend config changes (e.g., after model selection or initial load)
    useEffect(() => {
        setUiProvider(transcriptModelConfig.provider);
    }, [transcriptModelConfig.provider]);

    useEffect(() => {
        load('store.json').then(store =>
            store.get<string>('whisperEndpoint').then(v => setWhisperEndpoint(v || ''))
        ).catch(() => { });
    }, []);

    const fetchApiKey = async (provider: string) => {
        try {

            const data = await invoke('api_get_transcript_api_key', { provider }) as string;

            setApiKey(data || '');
        } catch (err) {
            console.error('Error fetching API key:', err);
            setApiKey(null);
        }
    };
    const modelOptions = {
        groq: ['whisper-large-v3-turbo', 'whisper-large-v3'],
        selfHostedWhisper: ['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper-1'],
    };
    const requiresApiKey = true;

    const handleInputClick = () => {
        if (isApiKeyLocked) {
            setIsLockButtonVibrating(true);
            setTimeout(() => setIsLockButtonVibrating(false), 500);
        }
    };

    const handleSave = async () => {
        try {
            await invoke('api_save_transcript_config', {
                provider: uiProvider,
                model: transcriptModelConfig.model,
                apiKey,
            });

            if (uiProvider === 'selfHostedWhisper') {
                const store = await load('store.json');
                await store.set('whisperEndpoint', whisperEndpoint);
                await store.save();
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 1200);
        } catch (error) {
            console.error('Failed to save transcript settings:', error);
        }
    };

    return (
        <div>
            <div>
                {/* <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Transcript Settings</h3>
                </div> */}
                <div className="space-y-4 pb-6">
                    <div>
                        <Label className="block text-sm font-medium text-gray-700 mb-1">
                            Transcript Model
                        </Label>
                        <div className="flex space-x-2 mx-1">
                            <Select
                                value={uiProvider}
                                onValueChange={(value) => {
                                    const provider = value as TranscriptModelProps['provider'];
                                    setUiProvider(provider);
                                    const nextModels = modelOptions[provider];
                                    const nextModel = nextModels.includes(transcriptModelConfig.model)
                                        ? transcriptModelConfig.model
                                        : nextModels[0];
                                    setTranscriptModelConfig({ ...transcriptModelConfig, provider, model: nextModel });
                                    fetchApiKey(provider);
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="groq">☁️ Groq (whisper-large-v3-turbo)</SelectItem>
                                    <SelectItem value="selfHostedWhisper">🏠 Self-hosted Whisper (OpenAI-compatible)</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select
                                value={transcriptModelConfig.model}
                                onValueChange={(value) => {
                                    const model = value as TranscriptModelProps['model'];
                                    setTranscriptModelConfig({ ...transcriptModelConfig, provider: uiProvider, model });
                                }}
                            >
                                <SelectTrigger className='focus:ring-1 focus:ring-blue-500 focus:border-blue-500'>
                                    <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {modelOptions[uiProvider].map((model) => (
                                        <SelectItem key={model} value={model}>{model}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                        </div>
                    </div>

                    {uiProvider === 'selfHostedWhisper' && (
                        <div>
                            <Label className="block text-sm font-medium text-gray-700 mb-1">Whisper Server URL</Label>
                            <Input
                                type="text"
                                placeholder="http://whisper.company.internal/v1"
                                value={whisperEndpoint}
                                onChange={e => setWhisperEndpoint(e.target.value)}
                                className="focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    )}


                    {requiresApiKey && (
                        <div>
                            <Label className="block text-sm font-medium text-gray-700 mb-1">
                                API Key
                            </Label>
                            <div className="relative mx-1">
                                <Input
                                    type={showApiKey ? "text" : "password"}
                                    className={`pr-24 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${isApiKeyLocked ? 'bg-gray-100 cursor-not-allowed' : ''
                                        }`}
                                    value={apiKey || ''}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    disabled={isApiKeyLocked}
                                    onClick={handleInputClick}
                                    placeholder="Enter your API key"
                                />
                                {isApiKeyLocked && (
                                    <div
                                        onClick={handleInputClick}
                                        className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-50 rounded-md cursor-not-allowed"
                                    />
                                )}
                                <div className="absolute inset-y-0 right-0 pr-1 flex items-center">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setIsApiKeyLocked(!isApiKeyLocked)}
                                        className={`transition-colors duration-200 ${isLockButtonVibrating ? 'animate-vibrate text-red-500' : ''
                                            }`}
                                        title={isApiKeyLocked ? "Unlock to edit" : "Lock to prevent editing"}
                                    >
                                        {isApiKeyLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                    >
                                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3">
                        <Button type="button" onClick={handleSave}>
                            Save
                        </Button>
                        {saved && <span className="text-sm text-green-600">Saved</span>}
                    </div>
                </div>
            </div>
        </div >
    )
}







