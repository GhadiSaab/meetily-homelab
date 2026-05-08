use super::api_provider::ApiTranscriptionProvider;
use super::provider::TranscriptionProvider;
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

pub enum TranscriptionEngine {
    Provider(Arc<dyn TranscriptionProvider>),
}

impl TranscriptionEngine {
    pub async fn is_model_loaded(&self) -> bool {
        match self {
            Self::Provider(provider) => provider.is_model_loaded().await,
        }
    }

    pub async fn get_current_model(&self) -> Option<String> {
        match self {
            Self::Provider(provider) => provider.get_current_model().await,
        }
    }

    pub fn provider_name(&self) -> &str {
        match self {
            Self::Provider(provider) => provider.provider_name(),
        }
    }
}

pub async fn validate_transcription_model_ready<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let config = match crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await
    {
        Ok(Some(config)) => config,
        Ok(None) => {
            return Err("No transcription provider configured. Please open Settings → Transcript and configure Groq or Self-hosted Whisper.".to_string());
        }
        Err(e) => {
            return Err(format!("Failed to read transcription config: {}", e));
        }
    };

    match config.provider.as_str() {
        "groq" | "selfHostedWhisper" => {
            info!("Provider '{}' uses API transcription, no local model needed", config.provider);
            Ok(())
        }
        other => {
            Err(format!(
                "Provider '{}' is not supported. Please select Groq or Self-hosted Whisper in Settings → Transcript.",
                other
            ))
        }
    }
}

pub async fn get_or_init_transcription_engine<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<TranscriptionEngine, String> {
    let config = match crate::api::api::api_get_transcript_config(
        app.clone(),
        app.clone().state(),
        None,
    )
    .await
    {
        Ok(Some(config)) => config,
        Ok(None) => {
            return Err("No transcription provider configured. Please open Settings → Transcript and configure Groq or Self-hosted Whisper.".to_string());
        }
        Err(e) => {
            return Err(format!("Failed to read transcription config: {}", e));
        }
    };

    match config.provider.as_str() {
        "groq" => {
            info!("Initializing Groq API transcription provider");
            let api_key = config.api_key.unwrap_or_default();
            let model = if config.model.is_empty() {
                "whisper-large-v3-turbo".to_string()
            } else {
                config.model
            };
            let endpoint = "https://api.groq.com/openai/v1".to_string();
            Ok(TranscriptionEngine::Provider(Arc::new(
                ApiTranscriptionProvider::new(endpoint, api_key, model),
            )))
        }
        "selfHostedWhisper" => {
            info!("Initializing self-hosted Whisper API transcription provider");
            let store = app
                .store("store.json")
                .map_err(|e| format!("Failed to open store: {}", e))?;
            let endpoint = store
                .get("whisperEndpoint")
                .and_then(|v| v.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .ok_or("Missing whisper endpoint. Please set it in Settings → Transcript.")?;
            let model = config.model;
            let api_key = config.api_key.unwrap_or_default();
            Ok(TranscriptionEngine::Provider(Arc::new(
                ApiTranscriptionProvider::new(endpoint, api_key, model),
            )))
        }
        other => Err(format!(
            "Provider '{}' is not supported. Please select Groq or Self-hosted Whisper.",
            other
        )),
    }
}
