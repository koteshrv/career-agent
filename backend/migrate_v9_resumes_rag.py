"""Phase 3 of the multi-user rollout: moves the flat, shared resume directory and the
single global RAG collection into per-user storage, both owned by the bootstrap admin
(user_id=1). Plain Python, not sqlite3 — this touches the filesystem and ChromaDB, not
the SQL schema. Run once, manually, like the other migrate_vN scripts in this directory.
"""
import shutil
from pathlib import Path

import chromadb

ADMIN_USER_ID = 1


def migrate_resumes():
    resumes_dir = Path(__file__).parent / "uploads" / "resumes"
    admin_dir = resumes_dir / str(ADMIN_USER_ID)
    admin_dir.mkdir(parents=True, exist_ok=True)

    moved = 0
    for f in resumes_dir.glob("*"):
        if f.is_file():
            shutil.move(str(f), str(admin_dir / f.name))
            moved += 1
    print(f"Moved {moved} resume file(s) into {admin_dir}.")


def migrate_rag():
    vector_store_path = Path(__file__).parent / "vector_store"
    client = chromadb.PersistentClient(path=str(vector_store_path))

    existing = {c.name for c in client.list_collections()}
    if "career_brag_document" not in existing:
        print("No legacy 'career_brag_document' collection found — nothing to migrate.")
        return

    old = client.get_collection("career_brag_document")
    data = old.get(include=["documents", "embeddings", "metadatas"])
    ids = data.get("ids") or []

    if ids:
        # chromadb rejects empty-dict metadata ("Expected metadata to be a non-empty
        # dict") — older chunks ingested before embedding-model tagging existed have none.
        metadatas = [m if m else {"embedding_model": "unknown"} for m in data["metadatas"]]
        new = client.get_or_create_collection(f"career_brag_document_{ADMIN_USER_ID}")
        new.add(ids=ids, documents=data["documents"], embeddings=data["embeddings"], metadatas=metadatas)
        print(f"Copied {len(ids)} knowledge-base chunk(s) into career_brag_document_{ADMIN_USER_ID}.")
    else:
        print("Legacy collection was empty — nothing to copy.")

    client.delete_collection("career_brag_document")
    print("Removed the old shared 'career_brag_document' collection.")


if __name__ == "__main__":
    migrate_resumes()
    migrate_rag()
