from pydantic import BaseModel
from typing import List, Tuple, Literal
from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.models.groq import GroqModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.groq import GroqProvider
from pydantic_ai.providers.anthropic import AnthropicProvider

import httpx
import json as _json
import logging
from dotenv import load_dotenv
from db import DatabaseManager





# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()  # Load environment variables from .env file

db = DatabaseManager()

class Block(BaseModel):
    """Represents a block of content in a section.
    
    Block types must align with frontend rendering capabilities:
    - 'text': Plain text content
    - 'bullet': Bulleted list item
    - 'heading1': Large section heading
    - 'heading2': Medium section heading
    
    Colors currently supported:
    - 'gray': Gray text color
    - '' or any other value: Default text color
    """
    id: str
    type: Literal['bullet', 'heading1', 'heading2', 'text']
    content: str
    color: str  # Frontend currently only uses 'gray' or default

class Section(BaseModel):
    """Represents a section in the meeting summary"""
    title: str
    blocks: List[Block]

class MeetingNotes(BaseModel):
    """Represents the meeting notes"""
    meeting_name: str
    sections: List[Section]

class People(BaseModel):
    """Represents the people in the meeting. Always have this part in the output. Title - Person Name (Role, Details)"""
    title: str
    blocks: List[Block]

class SummaryResponse(BaseModel):
    """Represents the meeting summary response based on a section of the transcript"""
    MeetingName : str
    People : People
    SessionSummary : Section
    CriticalDeadlines: Section
    KeyItemsDecisions: Section
    ImmediateActionItems: Section
    NextSteps: Section
    MeetingNotes: MeetingNotes

# --- Main Class Used by main.py ---

class TranscriptProcessor:
    """Handles the processing of meeting transcripts using AI models."""
    def __init__(self):
        """Initialize the transcript processor."""
        logger.info("TranscriptProcessor initialized.")
        self.db = DatabaseManager()

    async def process_transcript(self, text: str, model: str, model_name: str, chunk_size: int = 5000, overlap: int = 1000, custom_prompt: str = "") -> Tuple[int, List[str]]:
        """
        Process transcript text into chunks and generate structured summaries for each chunk using an AI model.

        Args:
            text: The transcript text.
            model: The AI model provider ('claude', 'gemini', 'groq', 'openai').
            model_name: The specific model name.
            chunk_size: The size of each text chunk.
            overlap: The overlap between consecutive chunks.
            custom_prompt: A custom prompt to use for the AI model.

        Returns:
            A tuple containing:
            - The number of chunks processed.
            - A list of JSON strings, where each string is the summary of a chunk.
        """

        logger.info(f"Processing transcript (length {len(text)}) with model provider={model}, model_name={model_name}, chunk_size={chunk_size}, overlap={overlap}")

        all_json_data = []
        agent = None # Define agent variable
        llm = None # Define llm variable

        try:
            # Split transcript into chunks (shared by all providers)
            step = chunk_size - overlap
            if step <= 0:
                logger.warning(f"Overlap ({overlap}) >= chunk_size ({chunk_size}). Adjusting overlap.")
                overlap = max(0, chunk_size - 100)
                step = chunk_size - overlap

            chunks = [text[i:i+chunk_size] for i in range(0, len(text), step)]
            num_chunks = len(chunks)
            logger.info(f"Split transcript into {num_chunks} chunks.")

            # Gemini: direct REST call — response_schema not supported on Gemma models
            if model == "gemini":
                api_key = await db.get_api_key("gemini")
                if not api_key:
                    raise ValueError("GEMINI_API_KEY not configured")
                logger.info(f"Using Gemini REST (no structured output) for model: {model_name}")

                schema_hint = """{
  "MeetingName": "<string>",
  "People": {"title": "People", "blocks": [{"id":"<str>","type":"bullet","content":"<Name (Role)>","color":""}]},
  "SessionSummary": {"title": "Session Summary", "blocks": [{"id":"<str>","type":"text","content":"<str>","color":""}]},
  "CriticalDeadlines": {"title": "Critical Deadlines", "blocks": []},
  "KeyItemsDecisions": {"title": "Key Items & Decisions", "blocks": [{"id":"<str>","type":"bullet","content":"<str>","color":""}]},
  "ImmediateActionItems": {"title": "Immediate Action Items", "blocks": [{"id":"<str>","type":"bullet","content":"<str>","color":""}]},
  "NextSteps": {"title": "Next Steps", "blocks": [{"id":"<str>","type":"bullet","content":"<str>","color":""}]},
  "MeetingNotes": {"meeting_name": "<str>", "sections": [{"title":"<str>","blocks":[{"id":"<str>","type":"text","content":"<str>","color":""}]}]}
}"""

                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

                async with httpx.AsyncClient(timeout=120.0) as client:
                    for i, chunk in enumerate(chunks):
                        logger.info(f"Processing chunk {i+1}/{num_chunks}...")
                        prompt = f"""Analyze this meeting transcript chunk and return ONLY a valid JSON object matching exactly this schema. No markdown, no explanation, just the JSON.

Schema:
{schema_hint}

Rules:
- Block "type" must be one of: text, bullet, heading1, heading2
- Block "color": use "gray" for low-importance items, "" for default
- Block "id": unique string like "b1", "b2", etc.
- If a section has no relevant content, use an empty blocks list

Additional context: {custom_prompt}

Transcript:
---
{chunk}
---

Return only the JSON object:"""

                        try:
                            resp = await client.post(url, json={
                                "contents": [{"parts": [{"text": prompt}]}],
                                "generationConfig": {"temperature": 0.1}
                            })
                            resp.raise_for_status()
                            data = resp.json()
                            raw_text = ""
                            for part in data.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                                if not part.get("thought"):
                                    raw_text += part.get("text", "")

                            # Strip markdown code fences if present
                            raw_text = raw_text.strip()
                            if raw_text.startswith("```"):
                                raw_text = raw_text.split("```")[1]
                                if raw_text.startswith("json"):
                                    raw_text = raw_text[4:]
                                raw_text = raw_text.strip()

                            parsed = _json.loads(raw_text)
                            # Validate it has the expected top-level keys
                            SummaryResponse(**parsed)
                            all_json_data.append(_json.dumps(parsed))
                            logger.info(f"Successfully generated summary for chunk {i+1}.")
                        except Exception as chunk_error:
                            logger.error(f"Error processing chunk {i+1}: {chunk_error}", exc_info=True)

                logger.info(f"Finished processing all {num_chunks} chunks.")
                return num_chunks, all_json_data

            # All other providers use pydantic-ai
            if model == "claude":
                api_key = await db.get_api_key("claude")
                if not api_key: raise ValueError("ANTHROPIC_API_KEY environment variable not set")
                llm = AnthropicModel(model_name, provider=AnthropicProvider(api_key=api_key))
                logger.info(f"Using Claude model: {model_name}")
            elif model == "groq":
                api_key = await db.get_api_key("groq")
                if not api_key: raise ValueError("GROQ_API_KEY environment variable not set")
                llm = GroqModel(model_name, provider=GroqProvider(api_key=api_key))
                logger.info(f"Using Groq model: {model_name}")
            elif model == "openai":
                api_key = await db.get_api_key("openai")
                if not api_key: raise ValueError("OPENAI_API_KEY environment variable not set")
                llm = OpenAIModel(model_name, provider=OpenAIProvider(api_key=api_key))
                logger.info(f"Using OpenAI model: {model_name}")
            else:
                logger.error(f"Unsupported model provider requested: {model}")
                raise ValueError(f"Unsupported model provider: {model}")

            agent = Agent(llm, result_type=SummaryResponse, result_retries=2)
            logger.info("Pydantic-AI Agent initialized.")

            for i, chunk in enumerate(chunks):
                logger.info(f"Processing chunk {i+1}/{num_chunks}...")
                try:
                    summary_result = await agent.run(
                        f"""Given the following meeting transcript chunk, extract the relevant information according to the required JSON structure. If a specific section (like Critical Deadlines) has no relevant information in this chunk, return an empty list for its 'blocks'. Ensure the output is only the JSON data.

                        IMPORTANT: Block types must be one of: 'text', 'bullet', 'heading1', 'heading2'
                        - Use 'text' for regular paragraphs
                        - Use 'bullet' for list items
                        - Use 'heading1' for major headings
                        - Use 'heading2' for subheadings

                        For the color field, use 'gray' for less important content or '' (empty string) for default.

                        Transcript Chunk:
                        ---
                        {chunk}
                        ---

                        Please capture all relevant action items. Transcription can have spelling mistakes. correct it if required. context is important.

                        While generating the summary, please add the following context:
                        ---
                        {custom_prompt}
                        ---
                        Make sure the output is only the JSON data.
                        """,
                    )

                    if hasattr(summary_result, 'data') and isinstance(summary_result.data, SummaryResponse):
                        final_summary_pydantic = summary_result.data
                    elif isinstance(summary_result, SummaryResponse):
                        final_summary_pydantic = summary_result
                    else:
                        logger.error(f"Unexpected result type from agent for chunk {i+1}: {type(summary_result)}")
                        continue

                    chunk_summary_json = final_summary_pydantic.model_dump_json()
                    all_json_data.append(chunk_summary_json)
                    logger.info(f"Successfully generated summary for chunk {i+1}.")

                except Exception as chunk_error:
                    logger.error(f"Error processing chunk {i+1}: {chunk_error}", exc_info=True)

            logger.info(f"Finished processing all {num_chunks} chunks.")
            return num_chunks, all_json_data

        except Exception as e:
            logger.error(f"Error during transcript processing: {str(e)}", exc_info=True)
            raise

    def cleanup(self):
        """Clean up resources used by the TranscriptProcessor."""
        logger.info("Cleaning up TranscriptProcessor resources")
        try:
            # Close database connections if any
            if hasattr(self, 'db') and self.db is not None:
                # self.db.close()
                logger.info("Database connection cleanup (using context managers)")
        except Exception as e:
            logger.error(f"Error during TranscriptProcessor cleanup: {str(e)}", exc_info=True)

        
