"""
AI Interview Engine — Optimized Performance Architecture
─────────────────────────────────────────────────────────
Optimizations:
  • Model warm-loading at startup (not per-request)
  • Google Gemini API (gemini-2.5-flash) for fast LLM inference
  • Two-phase evaluation: instant score (<2s) + background deep analysis
  • Parallel evaluation with asyncio.gather()
  • Reduced LLM calls: local scoring for similarity/keywords/communication
  • Active-time-only timer (pauses during AI processing)
  • Pre-generation of questions during answer evaluation
"""

import asyncio
import json
import re
from typing import List, Dict, Any, Optional
from datetime import datetime

import numpy as np

try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
    ST_AVAILABLE = True
except ImportError:
    ST_AVAILABLE = False

import google.genai as genai
from google.genai import types as genai_types
from app.core.config import settings


# ── Master system prompt injected into every LLM call ──────

MASTER_SYSTEM_PROMPT = """You are an advanced AI Interview Engine designed to simulate a real-world corporate interview.
You must conduct the interview exactly like a senior interviewer at a top company (Google, Microsoft, Amazon level).

CORE RULES:
1. NEVER repeat a question or ask a semantically similar variation of a previously asked question.
2. The interview is TIME-BASED — keep generating questions until the allocated time expires.
3. All questions MUST be derived from the Job Description, required skills, tools, and responsibilities.
4. There are TWO rounds: Technical (Round 1) then HR (Round 2).
   - Technical: core skills, problem-solving, scenario-based, tool-specific, system-design questions.
   - HR: behavioral (STAR method), cultural fit, conflict resolution, leadership, career goals, situational judgment.
5. Adapt difficulty based on the candidate's last answer score:
   - Strong (>80%): increase difficulty significantly, ask deeper follow-up, probe edge cases.
   - Moderate (50-80%): ask clarification, probe practical understanding, give a scenario.
   - Weak (<50%): simplify slightly, ask a supportive fallback, or move to an easier related topic.
6. Follow-up questions MUST be context-aware and directly reference the candidate's previous answer.
7. Always generate a comprehensive ideal reference answer (at least 3-4 sentences) and 5-7 evaluation keywords.
8. Always return valid JSON — no markdown, no extra text.

QUESTION VARIETY (mix these types across the interview):
- Conceptual: "Explain how X works and why it matters"
- Scenario-based: "Given situation X, how would you approach..."
- Problem-solving: "Design a solution for..."
- Experience-based: "Tell me about a time when..."
- Trade-off analysis: "Compare X vs Y, when would you choose each?"
- Debugging: "This code/system has issue X, how would you diagnose it?"
- System design: "How would you architect a system that..."

IDEAL ANSWER QUALITY:
- The ideal_answer must be a detailed, expert-level response (not generic)
- Include specific technologies, patterns, metrics, or frameworks where applicable
- For HR questions, include STAR method structure in the ideal answer
"""


class AIService:
    """High-performance AI interview engine with warm-loaded models and parallel evaluation."""

    def __init__(self):
        self._embedding_model: Optional[SentenceTransformer] = None
        self._gemini_client = None
        self._warmed_up = False
        self._warmup_lock = asyncio.Lock()
        # Cache for pre-generated questions
        self._question_cache: Dict[str, Dict] = {}

    # ── Warm-up: Load models once at startup ──────────

    async def warm_up(self):
        """Lightweight startup — initialize Gemini client."""
        if self._warmed_up:
            return
        async with self._warmup_lock:
            if self._warmed_up:
                return
            print("🔄 Initializing AI service...")

            # 1. Skip embedding model at startup — loads on first use
            # This saves ~400MB RAM, critical for Render free tier (512MB)

            # 2. Configure Google Gemini
            if settings.GEMINI_API_KEY:
                self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
                print(f"  ✅ Gemini configured (model: {settings.GEMINI_MODEL})")
            else:
                print("  ⚠️ GEMINI_API_KEY not set — LLM calls will return empty results")

            self._warmed_up = True
            print("✅ AI Engine ready — models will load on first use")

    async def shutdown(self):
        """Cleanup on app shutdown."""
        pass  # Gemini SDK doesn't require explicit cleanup

    @property
    def embedding_model(self):
        if not ST_AVAILABLE:
            return None
        if self._embedding_model is None:
            try:
                self._embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
            except Exception:
                return None
        return self._embedding_model

    # ── Gemini helpers ────────────────────────────────

    async def _gemini_generate(self, prompt: str, system: str = "", fast: bool = False) -> str:
        """Call Google Gemini API. fast=True uses lower token limit."""
        if not self._gemini_client:
            if settings.GEMINI_API_KEY:
                self._gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
            else:
                print("Gemini error: GEMINI_API_KEY not configured")
                return ""

        full_system = MASTER_SYSTEM_PROMPT + "\n\n" + system
        max_tokens = 512 if fast else 2048

        try:
            response = await asyncio.to_thread(
                self._gemini_client.models.generate_content,
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    system_instruction=full_system,
                    temperature=0.7,
                    max_output_tokens=max_tokens,
                ),
            )
            return response.text if response.text else ""
        except Exception as e:
            print(f"Gemini error: {e}")
            return ""

    def _parse_json_from_response(self, text: str) -> dict:
        """Extract JSON from LLM response text."""
        json_match = re.search(r"\{[\s\S]*\}", text)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        return {}

    # ── JD Analysis ───────────────────────────────────

    async def analyze_job_description(self, job_description: str, job_title: str) -> Dict[str, Any]:
        """Extract skills, responsibilities, tools, and soft-skill expectations from a JD."""
        prompt = f"""Analyze this Job Description and extract structured information.

Job Title: {job_title}
Job Description:
{job_description}

Return ONLY a JSON object:
{{
  "required_skills": ["skill1", "skill2"],
  "key_responsibilities": ["resp1", "resp2"],
  "tools_and_frameworks": ["tool1", "tool2"],
  "soft_skills": ["soft1", "soft2"],
  "experience_expectations": "summary of expected experience",
  "technical_topics": ["topic1", "topic2"],
  "hr_topics": ["topic1", "topic2"]
}}"""

        response = await self._gemini_generate(prompt, "You are a JD analysis expert. Return valid JSON only.")
        parsed = self._parse_json_from_response(response)
        if not parsed:
            parsed = {
                "required_skills": [job_title, "problem-solving", "communication"],
                "key_responsibilities": ["Perform role duties", "Collaborate with team"],
                "tools_and_frameworks": [],
                "soft_skills": ["teamwork", "communication", "leadership"],
                "experience_expectations": "Relevant industry experience",
                "technical_topics": [job_title],
                "hr_topics": ["motivation", "teamwork", "conflict resolution"],
            }
        return parsed

    # ── Question Generation (with pre-generation cache) ──

    async def generate_question(
        self,
        job_role: str,
        difficulty: str,
        previous_questions: List[str],
        round_type: str = "Technical",
        job_description: str = "",
        experience_level: str = "",
        previous_answers: List[str] = None,
        last_score: float = None,
        jd_analysis: Dict[str, Any] = None,
        is_coding_question: bool = False,
    ) -> Dict[str, Any]:
        """Generate a single adaptive interview question."""

        prev_q_text = "\n".join(f"- {q}" for q in previous_questions[-30:]) if previous_questions else "None"
        prev_a_text = ""
        if previous_answers and len(previous_answers) > 0:
            last_answer = previous_answers[-1] if previous_answers else ""
            prev_a_text = f"\nCandidate's last answer: {last_answer}"

        followup_instruction = ""
        if last_score is not None:
            if last_score >= 80:
                followup_instruction = "The candidate scored well. INCREASE difficulty. Ask a deeper technical follow-up related to their last answer."
            elif last_score >= 50:
                followup_instruction = "The candidate gave a moderate answer. Ask a clarification question or probe their practical understanding."
            else:
                followup_instruction = "The candidate struggled. Ask a simpler, supportive question on a related topic or move to an easier area."

        jd_context = ""
        if job_description:
            jd_context = f"\nFull Job Description:\n{job_description}\n"
        if jd_analysis:
            jd_context += f"\nExtracted Skills: {json.dumps(jd_analysis.get('required_skills', []))}"
            jd_context += f"\nKey Responsibilities: {json.dumps(jd_analysis.get('key_responsibilities', []))}"
            jd_context += f"\nTools & Frameworks: {json.dumps(jd_analysis.get('tools_and_frameworks', []))}"
            if round_type == "HR":
                jd_context += f"\nSoft Skills to Evaluate: {json.dumps(jd_analysis.get('soft_skills', []))}"
                jd_context += f"\nHR Topics: {json.dumps(jd_analysis.get('hr_topics', []))}"
            else:
                jd_context += f"\nTechnical Topics: {json.dumps(jd_analysis.get('technical_topics', []))}"

        coding_instruction = ""
        if is_coding_question:
            coding_instruction = """
This must be a CODING question. Ask the candidate to write code to solve a specific problem.
Include in the question: the problem statement, expected input/output, and any constraints.
The ideal_answer should contain a working code solution.
Set "is_coding": true in the response."""

        # Add randomization seed for variety across sessions
        import random
        variety_seed = random.randint(1, 10000)
        topic_angles = [
            "a practical scenario", "a conceptual deep-dive", "a real-world problem",
            "a comparison or trade-off analysis", "a design challenge",
            "an optimization problem", "a debugging scenario", "a best-practices discussion",
            "an architecture decision", "a recent technology trend",
        ]
        chosen_angle = random.choice(topic_angles)

        prompt = f"""Generate a {round_type} interview question for a {job_role} position.
Experience Level: {experience_level or 'Not specified'}
Difficulty: {difficulty}
Round: {round_type}
{jd_context}

Previously asked questions (DO NOT repeat these or ask semantically similar questions — pick a DIFFERENT topic/angle each time):
{prev_q_text}
{prev_a_text}

{followup_instruction}
{coding_instruction}

IMPORTANT: Create a UNIQUE question that is DIFFERENT from all previously asked questions above.
Approach this from the angle of: {chosen_angle}.
Variety seed: {variety_seed} — use this to add creative variation.

Return ONLY a JSON object in this exact format:
{{
  "round": "{round_type}",
  "question": "Your interview question here",
  "ideal_answer": "The ideal comprehensive answer",
  "evaluation_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "difficulty_level": "{difficulty}",
  "is_coding": false,
  "followup_trigger_conditions": {{
    "strong_answer": "Follow-up if candidate scores >80%",
    "moderate_answer": "Follow-up if candidate scores 50-80%",
    "weak_answer": "Fallback if candidate scores <50%"
  }}
}}"""

        system = f"You are an expert {round_type} interviewer. Generate relevant, professional questions strictly aligned with the job description. Always return valid JSON."

        response = await self._gemini_generate(prompt, system)
        parsed = self._parse_json_from_response(response)

        if not parsed or "question" not in parsed:
            if round_type == "HR":
                fallback_questions = [
                    "Tell me about a time when you had to handle a conflict with a team member.",
                    "What motivates you to excel in your career?",
                    "Describe a situation where you demonstrated leadership.",
                    "Where do you see yourself in five years?",
                    "How do you handle pressure and tight deadlines?",
                    "Tell me about a challenging project and how you managed it.",
                ]
            else:
                fallback_questions = [
                    f"Explain the core concepts and best practices of {job_role}.",
                    f"Describe a challenging technical problem you solved as a {job_role}.",
                    f"What tools and technologies do you use most as a {job_role}?",
                    f"Walk me through how you would design a system for a common {job_role} task.",
                    f"What is your approach to debugging and troubleshooting?",
                    f"Explain a complex concept from your domain in simple terms.",
                ]

            chosen = fallback_questions[0]
            for fq in fallback_questions:
                if fq not in previous_questions:
                    chosen = fq
                    break

            parsed = {
                "round": round_type,
                "question": chosen,
                "ideal_answer": "A strong answer should cover relevant experience, specific examples, and demonstrate domain knowledge.",
                "evaluation_keywords": ["experience", "skills", "knowledge", "examples", "approach"],
                "difficulty_level": difficulty,
                "is_coding": False,
                "followup_trigger_conditions": {},
            }

        parsed.setdefault("round", round_type)
        parsed.setdefault("evaluation_keywords", parsed.get("keywords", ["experience", "skills"]))
        parsed.setdefault("difficulty_level", difficulty)
        parsed.setdefault("is_coding", False)
        parsed.setdefault("followup_trigger_conditions", {})
        parsed["keywords"] = parsed["evaluation_keywords"]

        return parsed

    # ── Pre-generate next question (fire-and-forget) ──

    async def pre_generate_question(self, cache_key: str, **kwargs):
        """Pre-generate the next question in the background while evaluation runs."""
        try:
            q = await self.generate_question(**kwargs)
            self._question_cache[cache_key] = q
        except Exception as e:
            print(f"Pre-generation failed: {e}")

    def get_cached_question(self, cache_key: str) -> Optional[Dict]:
        """Get a pre-generated question from the cache."""
        return self._question_cache.pop(cache_key, None)

    # ── TWO-PHASE ANSWER EVALUATION ───────────────────
    #
    # Phase 1 (Instant, < 2s): Semantic similarity + keyword match + communication heuristics
    # Phase 2 (Background):    LLM depth analysis + AI feedback
    #

    def evaluate_answer_instant(
        self,
        question: str,
        ideal_answer: str,
        candidate_answer: str,
        keywords: List[str],
        round_type: str = "Technical",
    ) -> Dict[str, Any]:
        """Phase 1: Instant scoring using local models only (no LLM calls).
        Returns a score within ~1-2 seconds.
        """
        if not candidate_answer.strip():
            return {
                "content_score": 0, "keyword_score": 0, "depth_score": 0,
                "communication_score": 0, "confidence_score": 0, "overall_score": 0,
                "similarity_score": 0, "keyword_coverage": 0,
                "keywords_matched": [], "keywords_missed": keywords,
                "feedback": "No answer provided.",
                "answer_strength": "weak",
                "phase": "instant",
            }

        # 1. Semantic similarity (SentenceTransformer if available, else word overlap)
        if self.embedding_model is not None:
            embeddings = self.embedding_model.encode([ideal_answer, candidate_answer])
            sim_score = float(cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]) * 100
        else:
            # Word-overlap fallback
            ideal_words = set(ideal_answer.lower().split())
            cand_words = set(candidate_answer.lower().split())
            overlap = ideal_words & cand_words
            sim_score = (len(overlap) / max(len(ideal_words), 1)) * 100

        # 2. Keyword coverage (pure string match — instant)
        answer_lower = candidate_answer.lower()
        matched = [k for k in keywords if k.lower() in answer_lower]
        missed = [k for k in keywords if k.lower() not in answer_lower]
        keyword_pct = (len(matched) / max(len(keywords), 1)) * 100

        # 3. Communication score (heuristic — instant)
        word_count = len(candidate_answer.split())
        sentences = [s.strip() for s in candidate_answer.split(".") if s.strip()]
        # Base score from response length
        if word_count < 10:
            comm_score = 15
        elif word_count < 20:
            comm_score = 35
        elif word_count < 50:
            comm_score = 55
        elif word_count < 100:
            comm_score = 70
        elif word_count < 200:
            comm_score = 82
        else:
            comm_score = 88
        # Bonus for structured multi-sentence answers
        if len(sentences) >= 3:
            comm_score = min(100, comm_score + 8)
        if len(sentences) >= 5:
            comm_score = min(100, comm_score + 5)
        # Bonus for transition words indicating structured thinking
        structure_markers = ['firstly', 'secondly', 'however', 'moreover', 'for example',
                            'in addition', 'furthermore', 'therefore', 'in conclusion',
                            'on the other hand', 'specifically', 'for instance']
        marker_count = sum(1 for m in structure_markers if m in candidate_answer.lower())
        comm_score = min(100, comm_score + marker_count * 3)

        # 4. Depth estimate (heuristic based on similarity + length + keywords)
        depth_score = min(100, sim_score * 0.5 + keyword_pct * 0.3 + min(word_count, 100) * 0.2)

        # 5. Content accuracy
        content_score = (sim_score * 0.6) + (keyword_pct * 0.4)

        # 6. Confidence placeholder
        confidence_score = 50.0

        # 7. Overall score with master weights
        overall = (
            content_score * 0.40
            + keyword_pct * 0.20
            + depth_score * 0.15
            + comm_score * 0.15
            + confidence_score * 0.10
        )

        if overall >= 80:
            answer_strength = "strong"
        elif overall >= 50:
            answer_strength = "moderate"
        else:
            answer_strength = "weak"

        # Detailed heuristic feedback (no LLM)
        feedback_parts = []
        if sim_score >= 70:
            feedback_parts.append("Your answer aligns well with the expected response.")
        elif sim_score >= 40:
            feedback_parts.append("Your answer partially covers the expected content.")
        else:
            feedback_parts.append("Your answer doesn't closely match what was expected.")

        if keyword_pct >= 70:
            feedback_parts.append("Good use of relevant technical terminology.")
        elif missed:
            feedback_parts.append(f"Consider mentioning: {', '.join(missed[:3])}.")

        if word_count < 30:
            feedback_parts.append("Try to elaborate more — provide specific examples and details.")
        elif len(sentences) < 3:
            feedback_parts.append("Structure your answer into multiple points for clarity.")

        if overall >= 75:
            feedback_parts.append("Strong response overall!")
        elif overall < 40:
            feedback_parts.append("Review the core concepts and practice with concrete examples.")

        feedback = " ".join(feedback_parts)

        return {
            "content_score": round(content_score, 1),
            "keyword_score": round(keyword_pct, 1),
            "depth_score": round(depth_score, 1),
            "communication_score": round(comm_score, 1),
            "confidence_score": round(confidence_score, 1),
            "overall_score": round(overall, 1),
            "similarity_score": round(sim_score, 1),
            "keyword_coverage": round(keyword_pct, 1),
            "keywords_matched": matched,
            "keywords_missed": missed,
            "feedback": feedback,
            "answer_strength": answer_strength,
            "phase": "instant",
        }

    async def evaluate_answer_deep(
        self,
        question: str,
        ideal_answer: str,
        candidate_answer: str,
        keywords: List[str],
        instant_result: Dict[str, Any],
        round_type: str = "Technical",
    ) -> Dict[str, Any]:
        """Phase 2: Deep analysis using LLM (runs in background).
        Enhances the instant result with LLM depth and feedback.
        """
        try:
            # Run depth evaluation and feedback generation in parallel
            depth_task = self._evaluate_depth(question, candidate_answer, instant_result["similarity_score"])
            feedback_task = self._get_ai_feedback(question, candidate_answer, instant_result["overall_score"], round_type)

            depth_score, feedback = await asyncio.gather(depth_task, feedback_task)

            # Recalculate overall with real depth score
            content_score = instant_result["content_score"]
            keyword_pct = instant_result["keyword_score"]
            comm_score = instant_result["communication_score"]
            confidence_score = instant_result["confidence_score"]

            overall = (
                content_score * 0.40
                + keyword_pct * 0.20
                + depth_score * 0.15
                + comm_score * 0.15
                + confidence_score * 0.10
            )

            if overall >= 80:
                answer_strength = "strong"
            elif overall >= 50:
                answer_strength = "moderate"
            else:
                answer_strength = "weak"

            return {
                **instant_result,
                "depth_score": round(depth_score, 1),
                "overall_score": round(overall, 1),
                "feedback": feedback if feedback else instant_result["feedback"],
                "answer_strength": answer_strength,
                "phase": "deep",
            }
        except Exception as e:
            print(f"Deep evaluation error: {e}")
            return {**instant_result, "phase": "deep_failed"}

    async def evaluate_answer(
        self,
        question: str,
        ideal_answer: str,
        candidate_answer: str,
        keywords: List[str],
        round_type: str = "Technical",
        is_coding: bool = False,
    ) -> Dict[str, Any]:
        """Full evaluation: runs instant first, then deep in parallel.
        Returns the best available result.
        """
        # Phase 1: Instant (< 2s)
        instant = self.evaluate_answer_instant(
            question, ideal_answer, candidate_answer, keywords, round_type
        )

        # Phase 2: Deep (parallel LLM calls)
        try:
            deep = await asyncio.wait_for(
                self.evaluate_answer_deep(
                    question, ideal_answer, candidate_answer, keywords, instant, round_type
                ),
                timeout=15.0,  # Don't wait more than 15s for deep analysis
            )
            return deep
        except asyncio.TimeoutError:
            print("⚠️ Deep evaluation timed out, using instant scores")
            return instant

    async def _evaluate_depth(self, question: str, answer: str, sim_score: float) -> float:
        """Use LLM to evaluate depth of knowledge in the answer."""
        prompt = f"""Rate the depth of knowledge shown in this interview answer on a scale of 0-100.

Question: {question}
Answer: {answer}

Consider:
- Does the answer go beyond surface level?
- Are specific examples, frameworks, or methodologies mentioned?
- Does it show practical experience?

Return ONLY a JSON object: {{"depth_score": <number>}}"""

        try:
            response = await self._gemini_generate(prompt, "You are an expert evaluator. Return only valid JSON.", fast=True)
            parsed = self._parse_json_from_response(response)
            score = parsed.get("depth_score", sim_score * 0.8)
            return max(0, min(100, float(score)))
        except Exception:
            return sim_score * 0.8

    async def _get_ai_feedback(
        self, question: str, answer: str, score: float, round_type: str = "Technical"
    ) -> str:
        prompt = f"""Evaluate this {round_type} interview answer briefly (2-3 sentences).
Question: {question}
Answer: {answer}
Score: {score}/100

Provide constructive feedback: what was good, what could be improved, and one specific suggestion."""

        system = "You are an expert interviewer providing brief, constructive, actionable feedback."
        try:
            result = await self._gemini_generate(prompt, system, fast=True)
            if result.strip():
                return result.strip()
        except Exception:
            pass

        if score >= 70:
            return "Good answer with relevant details. Consider adding more specific examples to strengthen your response."
        elif score >= 40:
            return "Decent answer but could be more detailed. Include specific examples and demonstrate deeper knowledge."
        else:
            return "Answer needs improvement. Focus on addressing the question directly with relevant examples and key concepts."

    # ── Evaluate Code Submission ──────────────────────

    async def evaluate_code(
        self,
        question: str,
        ideal_answer: str,
        submitted_code: str,
        language: str = "python",
    ) -> Dict[str, Any]:
        """Evaluate a coding question submission."""
        prompt = f"""Evaluate this code submission for an interview coding question.

Question: {question}
Expected Solution: {ideal_answer}
Submitted Code ({language}):
```{language}
{submitted_code}
```

Evaluate on:
1. Correctness (does it solve the problem?) - 0-100
2. Code quality (readability, naming, structure) - 0-100
3. Efficiency (time/space complexity) - 0-100
4. Edge case handling - 0-100

Also generate 2-3 follow-up questions about the code logic.

Return ONLY a JSON object:
{{
  "correctness_score": <number>,
  "quality_score": <number>,
  "efficiency_score": <number>,
  "edge_case_score": <number>,
  "overall_score": <number>,
  "feedback": "Brief constructive feedback",
  "follow_up_questions": ["q1", "q2"]
}}"""

        response = await self._gemini_generate(prompt, "You are an expert code reviewer. Return valid JSON only.")
        parsed = self._parse_json_from_response(response)

        if not parsed or "overall_score" not in parsed:
            embeddings = self.embedding_model.encode([ideal_answer, submitted_code])
            sim = float(cosine_similarity([embeddings[0]], [embeddings[1]])[0][0]) * 100
            parsed = {
                "correctness_score": round(sim, 1),
                "quality_score": 50.0,
                "efficiency_score": 50.0,
                "edge_case_score": 40.0,
                "overall_score": round(sim * 0.8, 1),
                "feedback": "Code submitted. Review the expected solution for comparison.",
                "follow_up_questions": [
                    "Can you explain the time complexity of your solution?",
                    "How would you handle edge cases?",
                ],
            }

        return parsed

    # ── Round Transition Logic ────────────────────────

    def calculate_round_score(self, responses: List[dict]) -> float:
        """Calculate average overall score for a set of responses."""
        if not responses:
            return 0.0
        scores = [r.get("evaluation", {}).get("overall_score", 0) for r in responses]
        return round(sum(scores) / len(scores), 1)

    def should_proceed_to_hr(self, technical_score: float, cutoff: float = 70.0) -> bool:
        """Check if candidate qualifies for HR round."""
        return technical_score >= cutoff

    def determine_next_difficulty(self, last_score: float, current_difficulty: str) -> str:
        """Adapt difficulty based on last answer performance."""
        if last_score >= 80:
            return "hard"
        elif last_score >= 50:
            return "medium"
        else:
            return "easy"

    # ── ACTIVE-TIME TIMER (pauses during AI processing) ──

    def check_time_status(
        self,
        start_time: datetime,
        duration_minutes: int,
        processing_time_seconds: float = 0,
    ) -> Dict[str, Any]:
        """Check interview time status using ACTIVE TIME only.
        
        Subtracts cumulative AI processing time from elapsed time
        so candidates aren't penalized for slow evaluation.
        """
        now = datetime.utcnow()
        wall_elapsed = (now - start_time).total_seconds() / 60
        # Subtract processing overhead from elapsed time
        active_elapsed = max(0, wall_elapsed - (processing_time_seconds / 60))
        remaining = max(0, duration_minutes - active_elapsed)

        return {
            "elapsed_minutes": round(active_elapsed, 1),
            "remaining_minutes": round(remaining, 1),
            "remaining_seconds": int(remaining * 60),
            "is_expired": remaining <= 0,
            "is_wrap_up": 0 < remaining < 2,
            "progress_pct": min(100, round((active_elapsed / max(duration_minutes, 1)) * 100, 1)),
            "wall_elapsed_minutes": round(wall_elapsed, 1),
        }

    # ── Report Generation ─────────────────────────────

    async def generate_report(self, session: dict, user: dict) -> dict:
        """Generate comprehensive two-round interview report."""
        questions = session.get("questions", [])
        responses = session.get("responses", [])

        tech_evaluations = []
        hr_evaluations = []
        all_scores = {
            "content": [], "keyword": [], "depth": [],
            "communication": [], "confidence": [], "overall": [],
        }

        for resp in responses:
            q_doc = next(
                (q for q in questions if q["question_id"] == resp["question_id"]),
                None,
            )
            if not q_doc:
                continue

            ev = resp.get("evaluation", {})
            round_type = q_doc.get("round", "Technical")

            eval_entry = {
                "question": q_doc["question"],
                "answer": resp["answer_text"],
                "ideal_answer": q_doc.get("ideal_answer", ""),
                "round": round_type,
                "difficulty": q_doc.get("difficulty", "medium"),
                "scores": {
                    "content_score": ev.get("content_score", 0),
                    "keyword_score": ev.get("keyword_score", ev.get("keyword_coverage", 0)),
                    "depth_score": ev.get("depth_score", 0),
                    "communication_score": ev.get("communication_score", 0),
                    "confidence_score": ev.get("confidence_score", 50),
                    "overall_score": ev.get("overall_score", 0),
                },
                "feedback": ev.get("feedback", ""),
                "keywords_matched": ev.get("keywords_matched", []),
                "keywords_missed": ev.get("keywords_missed", []),
                "answer_strength": ev.get("answer_strength", "moderate"),
            }

            if round_type == "HR":
                hr_evaluations.append(eval_entry)
            else:
                tech_evaluations.append(eval_entry)

            for key in ["content", "keyword", "depth", "communication", "confidence", "overall"]:
                score_key = f"{key}_score"
                all_scores[key].append(ev.get(score_key, ev.get(key, 0)))

        def safe_avg(lst):
            return round(sum(lst) / max(len(lst), 1), 1)

        tech_scores = [e["scores"]["overall_score"] for e in tech_evaluations]
        hr_scores = [e["scores"]["overall_score"] for e in hr_evaluations]
        tech_avg = safe_avg(tech_scores)
        hr_avg = safe_avg(hr_scores)
        overall_avg = safe_avg(tech_scores + hr_scores)

        overall_scores = {
            "content_score": safe_avg(all_scores["content"]),
            "keyword_score": safe_avg(all_scores["keyword"]),
            "depth_score": safe_avg(all_scores["depth"]),
            "communication_score": safe_avg(all_scores["communication"]),
            "confidence_score": safe_avg(all_scores["confidence"]),
            "overall_score": overall_avg,
        }

        strengths, weaknesses, suggestions = self._analyze_performance(
            overall_scores, tech_evaluations + hr_evaluations
        )

        if tech_avg >= 70 and hr_avg >= 60:
            recommendation = "Selected"
            confidence_analysis = "Strong candidate with good technical and interpersonal skills."
        elif tech_avg >= 70:
            recommendation = "Maybe — HR skills need improvement"
            confidence_analysis = "Technically strong but needs improvement in soft skills."
        elif tech_avg >= 50:
            recommendation = "Not Selected — Below threshold"
            confidence_analysis = "Candidate shows potential but did not meet the required technical cutoff."
        else:
            recommendation = "Not Selected"
            confidence_analysis = "Candidate needs significant improvement in technical knowledge."

        comm_avg = overall_scores["communication_score"]
        if comm_avg >= 80:
            comm_feedback = "Excellent communication skills. Answers are well-structured and articulate."
        elif comm_avg >= 60:
            comm_feedback = "Good communication. Could improve answer structure and depth."
        elif comm_avg >= 40:
            comm_feedback = "Average communication. Needs to practice structuring responses clearly."
        else:
            comm_feedback = "Communication needs significant improvement. Practice the STAR method for behavioral questions."

        return {
            "session_id": str(session.get("_id", "")),
            "candidate_name": user.get("name", "Candidate"),
            "job_role": session.get("job_role", ""),
            "total_questions": len(responses),
            "technical_questions": len(tech_evaluations),
            "hr_questions": len(hr_evaluations),
            "technical_score": tech_avg,
            "hr_score": hr_avg,
            "overall_score": overall_avg,
            "overall_scores": overall_scores,
            "question_evaluations": tech_evaluations + hr_evaluations,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "improvement_suggestions": suggestions,
            "communication_feedback": comm_feedback,
            "confidence_analysis": confidence_analysis,
            "recommendation": recommendation,
            "round_summary": {
                "technical": {
                    "score": tech_avg,
                    "questions_asked": len(tech_evaluations),
                    "passed": tech_avg >= 70,
                },
                "hr": {
                    "score": hr_avg,
                    "questions_asked": len(hr_evaluations),
                    "passed": hr_avg >= 60,
                },
            },
            "generated_at": datetime.utcnow().isoformat(),
        }

    def _analyze_performance(self, scores: dict, evaluations: list) -> tuple:
        strengths = []
        weaknesses = []
        suggestions = []

        if scores.get("content_score", 0) >= 70:
            strengths.append("Strong technical knowledge and relevant answers")
        else:
            weaknesses.append("Content could be more relevant and detailed")
            suggestions.append("Study core concepts for your target role and practice explaining them")

        if scores.get("communication_score", 0) >= 70:
            strengths.append("Good communication skills and structured responses")
        else:
            weaknesses.append("Communication needs improvement")
            suggestions.append("Practice structuring answers using the STAR method (Situation, Task, Action, Result)")

        if scores.get("depth_score", 0) >= 70:
            strengths.append("Demonstrates deep understanding of concepts")
        else:
            weaknesses.append("Answers lack depth and practical examples")
            suggestions.append("Include specific examples, metrics, and real-world scenarios in your answers")

        if scores.get("keyword_score", 0) >= 70:
            strengths.append("Good use of industry terminology and keywords")
        else:
            weaknesses.append("Missing key industry terms and technical vocabulary")
            suggestions.append("Review job descriptions and use relevant technical terminology")

        if scores.get("overall_score", 0) >= 75:
            strengths.append("Overall strong interview performance")
        elif scores.get("overall_score", 0) < 40:
            weaknesses.append("Overall performance needs significant improvement")
            suggestions.append("Practice with mock interviews daily and review ideal answers")

        weak_count = sum(1 for e in evaluations if e.get("answer_strength") == "weak")
        if weak_count > len(evaluations) * 0.5 and len(evaluations) > 0:
            weaknesses.append(f"Struggled with {weak_count} out of {len(evaluations)} questions")
            suggestions.append("Focus on your weak areas and build confidence through practice")

        if not strengths:
            strengths.append("Willingness to practice and improve")
        if not suggestions:
            suggestions.append("Keep practicing to maintain your performance level")

        return strengths, weaknesses, suggestions


# Singleton
ai_service = AIService()
