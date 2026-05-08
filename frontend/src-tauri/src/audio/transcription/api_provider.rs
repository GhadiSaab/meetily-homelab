// audio/transcription/api_provider.rs
//
// OpenAI-compatible API transcription provider implementation.

use super::provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
use async_trait::async_trait;
use reqwest::multipart;
use serde::Deserialize;

pub struct ApiTranscriptionProvider {
    endpoint: String,
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl ApiTranscriptionProvider {
    pub fn new(endpoint: String, api_key: String, model: String) -> Self {
        Self {
            endpoint: endpoint.trim_end_matches('/').to_string(),
            api_key,
            model,
            client: reqwest::Client::new(),
        }
    }

    fn encode_wav(audio: &[f32]) -> Vec<u8> {
        let sample_rate: u32 = 16_000;
        let channels: u16 = 1;
        let bits_per_sample: u16 = 16;
        let bytes_per_sample: u16 = bits_per_sample / 8;

        let data_len = (audio.len() * bytes_per_sample as usize) as u32;
        let chunk_size = 36 + data_len;
        let byte_rate = sample_rate * channels as u32 * bytes_per_sample as u32;
        let block_align = channels * bytes_per_sample;

        let mut wav = Vec::with_capacity((44 + data_len) as usize);

        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&chunk_size.to_le_bytes());
        wav.extend_from_slice(b"WAVE");

        wav.extend_from_slice(b"fmt ");
        wav.extend_from_slice(&16u32.to_le_bytes()); // PCM fmt chunk size
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM audio format
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&sample_rate.to_le_bytes());
        wav.extend_from_slice(&byte_rate.to_le_bytes());
        wav.extend_from_slice(&block_align.to_le_bytes());
        wav.extend_from_slice(&bits_per_sample.to_le_bytes());

        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());

        for sample in audio {
            let clamped = sample.clamp(-1.0, 1.0);
            let pcm = (clamped * i16::MAX as f32).round() as i16;
            wav.extend_from_slice(&pcm.to_le_bytes());
        }

        wav
    }
}

#[derive(Deserialize)]
struct TranscriptionResponse {
    text: String,
}

#[async_trait]
impl TranscriptionProvider for ApiTranscriptionProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> std::result::Result<TranscriptResult, TranscriptionError> {
        let wav_bytes = Self::encode_wav(&audio);

        let file_part = multipart::Part::bytes(wav_bytes)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let mut form = multipart::Form::new()
            .part("file", file_part)
            .text("model", self.model.clone());

        if let Some(lang) = language {
            form = form.text("language", lang);
        }

        let url = format!("{}/audio/transcriptions", self.endpoint);

        let response = self
            .client
            .post(url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let response = response
            .error_for_status()
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let payload: TranscriptionResponse = response
            .json()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        Ok(TranscriptResult {
            text: payload.text,
            confidence: None,
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        true
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        "OpenAI-Compatible API"
    }
}
