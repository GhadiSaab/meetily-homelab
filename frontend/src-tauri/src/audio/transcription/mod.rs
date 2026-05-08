pub mod provider;
pub mod api_provider;
pub mod engine;
pub mod worker;

pub use provider::{TranscriptionError, TranscriptionProvider, TranscriptResult};
pub use api_provider::ApiTranscriptionProvider;
pub use engine::{
    TranscriptionEngine,
    validate_transcription_model_ready,
    get_or_init_transcription_engine,
};
pub use worker::{
    start_transcription_task,
    reset_speech_detected_flag,
    TranscriptUpdate
};
