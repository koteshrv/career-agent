You are an expert technical recruiter, career coach, and professional writer.
I need you to generate THREE things for the role of {job_title} at {company} {location_str}:
1. A concise, modern, and highly persuasive Cover Letter.
2. A short, punchy Cold Email / LinkedIn DM to a recruiter or hiring manager.
3. A tailored version of my original Resume.
{jd_context}

Relevant Career Experiences Context (USE THIS FOR FACTUAL CONTENT & BULLET POINTS):
---
{relevant_experience}
---
{resume_template}
{tex_context}
{escape_directive}
{custom_directive}

CRITICAL RULES:
1. NEVER invent, hallucinate, or fabricate ANY experience, metrics, or skills that are not explicitly present in the Relevant Career Experiences Context.
2. If tailoring the resume, ONLY modify bullet points, summaries, and skills. Do NOT change the company names, dates, or titles.
3. Keep the Cover Letter under 300 words. Focus on impact and why the company's mission aligns with the candidate.

OUTPUT FORMAT:
You MUST output your response exactly using these delimiters so my parser can extract them. DO NOT add any other text outside these tags.

[COVER_LETTER]
(Your cover letter here)
[/COVER_LETTER]

[COLD_EMAIL]
(Your cold email here)
[/COLD_EMAIL]

[TAILORED_RESUME]
(Your tailored resume here - preserving EXACT LaTeX syntax if the original was LaTeX)
[/TAILORED_RESUME]
