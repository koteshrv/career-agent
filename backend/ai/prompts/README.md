# Career-Agent Prompt Architecture

This directory contains the AI prompt templates (modes) used by the `career-agent` backend. These prompts originated from `career-ops` but have been explicitly transliterated for a stateless Web Application architecture.

## The Paradigm Shift

Unlike local CLI agents that run around the filesystem autonomously, `career-agent` is a stateless backend where Python securely orchestrates the data.
Therefore, all prompt `.md` files in this directory follow these structural rules:

1. **No Filesystem Commands:** The prompts do NOT instruct the AI to "read a folder" or "save to a file".
2. **Context Injection:** Python queries the Database (for the User Profile, Resume, and Job Data) and dynamically injects them into the prompt string before passing it to the LLM.
3. **Strict JSON Output:** The prompts strictly enforce that the LLM must output a valid JSON object matching our FastAPI schemas.

## Prompt Lifecycle & Connection

The following Mermaid diagram explains how the different prompt modes connect and cascade through the job search lifecycle:

```mermaid
flowchart TD
    subaxis((User Onboarding))
    
    interview["interview.md\n(Profile & CV Extractor)"]
    shared["_shared.md\n(Global Rules & Logic)"]
    profile["Settings DB\n(Replaces _profile.md)"]
    
    interview --> |Extracts Narrative| profile
    shared -.-> |Included in all prompts| profile

    subgraph Discovery
        scan["scan.md\n(JD Discovery)"]
        auto["auto-pipeline.md\n(Auto-Apply)"]
    end
    
    subgraph Evaluation
        oferta["oferta.md\n(5-Dimension Scoring)"]
    end
    
    subgraph Materials
        cover["cover.md\n(Cover Letter Gen)"]
        email["email.md\n(Cold Outreach Gen)"]
        latex["latex.md\n(Resume Tailoring)"]
    end
    
    subgraph Interview & Offer
        int_prep["interview-prep.md\n(Story Prep)"]
        offer["offer-prep.md\n(Comp Negotiation)"]
    end

    profile --> |Provides User Context| Discovery
    profile --> |Provides User Context| Evaluation
    profile --> |Provides User Context| Materials
    profile --> |Provides User Context| Interview & Offer
    
    scan --> |Discovers| oferta
    oferta --> |Validates Match| cover
    oferta --> |Validates Match| email
    oferta --> |Validates Match| latex
    
    latex --> int_prep
    int_prep --> offer
```
