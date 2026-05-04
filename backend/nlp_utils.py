"""
Utility module for processing Natural Language in Jira tickets.
Uses a local, lightweight HuggingFace sentence-transformer model to generate
semantic embeddings of ticket descriptions, allowing us to mathematically
compare how similar two tickets are in meaning, even if they use different words.
"""
import os
from sentence_transformers import SentenceTransformer
import numpy as np
import logging
from dotenv import load_dotenv

load_dotenv()
if os.path.exists("../.env"):
    load_dotenv("../.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Use a lightweight, high-performance model for semantic embeddings
MODEL_NAME = os.getenv("SENTENCE_TRANSFORMER_MODEL", "all-MiniLM-L6-v2")
_model = None

def load_model():
    """Explicitly load the NLP model. Call this during app startup."""
    global _model
    if _model is None:
        try:
            logger.info(f"Loading NLP model '{MODEL_NAME}'... This may take a moment on first run.")
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(MODEL_NAME)
            logger.info("NLP model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load NLP model: {e}")
            _model = None
    return _model

def get_text_embedding(text: str) -> np.ndarray:
    """
    Converts a text string into a normalized mathematical vector (magnitude = 1).
    """
    model = load_model()
    if not model or not text or not text.strip():
        return np.zeros((384,))
        
    try:
        # Generate the embedding and normalize it immediately using L2 normalization
        # This makes computing similarity later incredibly fast (just vector.dot(vector))
        embedding = model.encode(text)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            return embedding / norm
        return embedding
    except Exception as e:
        logger.error(f"Error encoding text: {e}")
        return np.zeros((384,))

def calculate_top_k_semantic_similarity(new_embedding: np.ndarray, historical_embeddings: list[np.ndarray], k: int = 5) -> float:
    """
    Calculates the dot product (cosine similarity since they are normalized) 
    between the new ticket and the user's past tickets. 
    Returns the average similarity of the user's top K closest matches.
    Prevents "Dilution" of expertise by noisy/unrelated historical tasks.
    """
    if not historical_embeddings or len(historical_embeddings) == 0:
        return 0.0
        
    # Standardize handling of zero vectors (missing text)
    if not np.any(new_embedding):
        return 0.0
        
    similarities = []
    
    for hist_emb in historical_embeddings:
        if hist_emb is not None and np.any(hist_emb):
            # Because vectors are pre-normalized, dot product == cosine similarity. Fast. O(N)
            sim = np.dot(new_embedding, hist_emb)
            similarities.append(float(sim))
            
    if not similarities:
        return 0.0
        
    # Sort descending
    similarities.sort(reverse=True)
    
    # Grab the Top K closest matches (or all if fewer than K)
    top_k = similarities[:k]
    
    # Return their average
    # Flooring negative values (though rare in MiniLM cosine space) to 0.0
    return max(0.0, sum(top_k) / len(top_k))
