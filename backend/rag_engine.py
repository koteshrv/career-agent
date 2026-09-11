import os
import uuid
import logging
import chromadb
from google import genai
from typing import List, Dict

logger = logging.getLogger(__name__)

# Setup ChromaDB persistent client
VECTOR_STORE_PATH = os.path.join(os.path.dirname(__file__), "vector_store")
chroma_client = chromadb.PersistentClient(path=VECTOR_STORE_PATH)

# One collection per user — each user's knowledge base is retrieved independently.
# Cached so repeated calls in the same process don't re-hit Chroma's collection registry.
_collections: Dict[int, "chromadb.Collection"] = {}


def _get_collection(user_id: int):
    if user_id not in _collections:
        _collections[user_id] = chroma_client.get_or_create_collection(name=f"career_brag_document_{user_id}")
    return _collections[user_id]


# Preferred first, fallback second. Embeddings are only comparable within the same model:
# vectors from different models occupy different spaces, so mixing them inside one
# collection yields silently meaningless similarity scores (or a dimension-mismatch error).
EMBEDDING_MODELS = ("gemini-embedding-001", "gemini-embedding-002")

# Which model this process settled on. Cached so a single transient 404 can't cause the
# ingest/query paths to drift onto different models mid-session.
_active_embedding_model: str = None


def get_embedding(text: str, api_key: str) -> List[float]:
    """Generates an embedding using Google Gemini API."""
    vector, _ = get_embedding_with_model(text, api_key)
    return vector


def get_embedding_with_model(text: str, api_key: str) -> tuple:
    """Returns (embedding, model_name) so callers can record which space the vector is in."""
    global _active_embedding_model

    if not api_key:
        raise ValueError("API key is required for embedding generation.")

    client = genai.Client(api_key=api_key)

    # Once a model is known-good, stay on it — never silently fall back mid-session.
    candidates = (_active_embedding_model,) if _active_embedding_model else EMBEDDING_MODELS

    last_error = None
    for model in candidates:
        try:
            response = client.models.embed_content(model=model, contents=text)
        except Exception as e:
            last_error = e
            if "404" in str(e) or "NOT_FOUND" in str(e):
                continue
            raise
        else:
            if _active_embedding_model != model:
                logger.info(f"[RAG] Using embedding model '{model}'.")
                _active_embedding_model = model
            return response.embeddings[0].values, model

    raise last_error


def _warn_on_mixed_embedding_models(user_id: int, current_model: str) -> None:
    """Chroma will happily compare vectors built by different embedding models and return
    nonsense. Surface that rather than letting it silently degrade retrieval quality."""
    try:
        stored = _get_collection(user_id).get(include=["metadatas"])
    except Exception:
        return
    models = {
        (m or {}).get("embedding_model")
        for m in (stored.get("metadatas") or [])
        if m and (m or {}).get("embedding_model")
    }
    foreign = models - {current_model}
    if foreign:
        logger.warning(
            f"[RAG] Knowledge base contains embeddings from {sorted(foreign)} but queries now "
            f"use '{current_model}'. Similarity scores across models are not meaningful — "
            f"re-ingest the knowledge base to restore reliable retrieval."
        )

def ingest_context(user_id: int, text: str, api_key: str) -> str:
    """Ingests a new career context chunk into this user's ChromaDB collection."""
    text = text.strip()
    if not text:
        raise ValueError("Context text cannot be empty.")

    embedding, model = get_embedding_with_model(text, api_key)
    doc_id = str(uuid.uuid4())

    # Record the model so a later model switch is detectable rather than silently
    # corrupting retrieval (see _warn_on_mixed_embedding_models).
    _get_collection(user_id).add(
        documents=[text],
        embeddings=[embedding],
        ids=[doc_id],
        metadatas=[{"embedding_model": model}],
    )
    return doc_id

def remove_context(user_id: int, doc_id: str):
    """Removes a specific career context chunk from this user's ChromaDB collection."""
    _get_collection(user_id).delete(ids=[doc_id])

def list_context(user_id: int) -> List[Dict]:
    """Lists all current career context chunks in this user's ChromaDB collection."""
    results = _get_collection(user_id).get()

    context_list = []
    if results and results.get("ids") and results.get("documents"):
        for doc_id, doc_text in zip(results["ids"], results["documents"]):
            context_list.append({"id": doc_id, "text": doc_text})

    return context_list

def retrieve_relevant_experience(user_id: int, job_description: str, top_k: int = 4, api_key: str = None) -> str:
    """Retrieves the most relevant experience chunks for a given job description."""
    if not api_key:
        raise ValueError("API key is required for experience retrieval.")

    collection = _get_collection(user_id)
    count = collection.count()
    if count == 0:
        return ""

    # Ensure job description isn't completely empty to avoid embedding errors
    if not job_description or not job_description.strip():
        return ""

    query_embedding, query_model = get_embedding_with_model(job_description.strip(), api_key)
    _warn_on_mixed_embedding_models(user_id, query_model)

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count)
    )

    if not results or not results.get("documents") or not results["documents"][0]:
        return ""

    # Concatenate the retrieved chunks
    relevant_chunks = results["documents"][0]
    return "\n\n".join(relevant_chunks)
