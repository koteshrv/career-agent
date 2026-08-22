import os
import sys

# Add the root directory to the Python path so backend modules can be imported
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend import crud
from backend.rag_engine import retrieve_relevant_experience, list_context

def main():
    print("--- Testing RAG Engine ---")
    
    # 1. Get API Key
    print("1. Fetching API key from database...")
    db = SessionLocal()
    settings = crud.get_settings(db)
    db.close()
    
    if not settings or not settings.gemini_api_key:
        print("❌ Error: No Gemini API key found in the database. Please add it via the Settings UI.")
        return
        
    api_key = settings.gemini_api_key
    print("✅ API key found.")
    
    # 2. Check total chunks in Knowledge Base
    print("\n2. Checking Knowledge Base...")
    try:
        chunks = list_context()
        print(f"✅ Found {len(chunks)} chunks in the vector database.")
        if len(chunks) == 0:
            print("⚠️ Warning: Your Knowledge Base is empty! Please add some context in the UI first.")
            return
    except Exception as e:
        print(f"❌ Error checking Knowledge Base: {e}")
        return

    # 3. Test Retrieval
    job_description = """
    We are looking for a Senior Integration Engineer to manage our enterprise API platform. 
    The ideal candidate will have extensive experience with Azure API Management (APIM), 
    building CI/CD pipelines, and writing automation scripts in Python. 
    Experience with Redis caching and security (RBAC) is a major plus.
    """
    
    print("\n3. Testing Semantic Retrieval...")
    print("Querying for Job Description:")
    print("-" * 40)
    print(job_description.strip())
    print("-" * 40)
    
    try:
        # Retrieve top 3 relevant chunks
        results = retrieve_relevant_experience(job_description, top_k=3, api_key=api_key)
        
        if not results:
            print("❌ No relevant experiences returned.")
        else:
            print("\n✅ Top Retrieved Experiences (Context injected into Drafter):")
            print("=" * 60)
            print(results)
            print("=" * 60)
            print("\n🎉 Success! RAG Engine is working perfectly.")
            
    except Exception as e:
        print(f"❌ Error during retrieval: {e}")

if __name__ == "__main__":
    main()
