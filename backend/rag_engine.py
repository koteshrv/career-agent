import os
import uuid
import chromadb
from google import genai
from typing import List, Dict

# Setup ChromaDB persistent client
VECTOR_STORE_PATH = os.path.join(os.path.dirname(__file__), "vector_store")
chroma_client = chromadb.PersistentClient(path=VECTOR_STORE_PATH)
collection = chroma_client.get_or_create_collection(name="career_brag_document")

def get_embedding(text: str, api_key: str) -> List[float]:
    """Generates an embedding using Google Gemini API."""
    if not api_key:
        raise ValueError("API key is required for embedding generation.")
    
    client = genai.Client(api_key=api_key)
    try:
        response = client.models.embed_content(
            model='gemini-embedding-001',
            contents=text,
        )
    except Exception as e:
        if "404" in str(e) or "NOT_FOUND" in str(e):
            response = client.models.embed_content(
                model='gemini-embedding-002',
                contents=text,
            )
        else:
            raise e
            
    return response.embeddings[0].values

def ingest_context(text: str, api_key: str) -> str:
    """Ingests a new career context chunk into ChromaDB."""
    text = text.strip()
    if not text:
        raise ValueError("Context text cannot be empty.")
        
    embedding = get_embedding(text, api_key)
    doc_id = str(uuid.uuid4())
    
    collection.add(
        documents=[text],
        embeddings=[embedding],
        ids=[doc_id]
    )
    return doc_id

def remove_context(doc_id: str):
    """Removes a specific career context chunk from ChromaDB."""
    collection.delete(ids=[doc_id])

def list_context() -> List[Dict]:
    """Lists all current career context chunks in ChromaDB."""
    results = collection.get()
    
    context_list = []
    if results and results.get("ids") and results.get("documents"):
        for doc_id, doc_text in zip(results["ids"], results["documents"]):
            context_list.append({"id": doc_id, "text": doc_text})
            
    return context_list

def ingest_master_document(file_path: str, api_key: str):
    """Reads a text file, splits it into chunks, and upserts them into ChromaDB."""
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Split by double newlines (paragraphs/chunks)
    chunks = [chunk.strip() for chunk in content.split("\n\n") if chunk.strip()]
    
    for chunk in chunks:
        ingest_context(chunk, api_key)

def retrieve_relevant_experience(job_description: str, top_k: int = 4, api_key: str = None) -> str:
    """Retrieves the most relevant experience chunks for a given job description."""
    if not api_key:
        raise ValueError("API key is required for experience retrieval.")
        
    count = collection.count()
    if count == 0:
        return ""
        
    # Ensure job description isn't completely empty to avoid embedding errors
    if not job_description or not job_description.strip():
        return ""
        
    query_embedding = get_embedding(job_description.strip(), api_key)
    
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=min(top_k, count)
    )
    
    if not results or not results.get("documents") or not results["documents"][0]:
        return ""
        
    # Concatenate the retrieved chunks
    relevant_chunks = results["documents"][0]
    return "\n\n".join(relevant_chunks)
