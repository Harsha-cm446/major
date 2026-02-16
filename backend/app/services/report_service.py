from io import BytesIO
from fpdf import FPDF
from datetime import datetime


def generate_pdf_report(report: dict) -> bytes:
    """Generate a PDF performance report from interview data."""
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # ── Title ─────────────────────────────────────
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(102, 126, 234)
    pdf.cell(0, 15, "Interview Performance Report", ln=True, align="C")
    pdf.ln(5)

    # ── Candidate info ────────────────────────────
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 8, f"Candidate: {report.get('candidate_name', 'N/A')}", ln=True)
    pdf.cell(0, 8, f"Role: {report.get('job_role', 'N/A')}", ln=True)
    pdf.cell(0, 8, f"Date: {datetime.now().strftime('%B %d, %Y')}", ln=True)
    pdf.cell(0, 8, f"Questions: {report.get('total_questions', 0)}", ln=True)
    pdf.ln(5)

    # ── Overall Scores ────────────────────────────
    scores = report.get("overall_scores", {})
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(102, 126, 234)
    pdf.cell(0, 10, "Overall Scores", ln=True)
    pdf.set_draw_color(102, 126, 234)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    score_items = [
        ("Content Score (40%)", scores.get("content_score", 0)),
        ("Communication Score (30%)", scores.get("communication_score", 0)),
        ("Confidence Score (20%)", scores.get("confidence_score", 0)),
        ("Emotion Stability (10%)", scores.get("emotion_score", 0)),
        ("Overall Score", scores.get("overall_score", 0)),
    ]
    for label, val in score_items:
        pdf.cell(100, 8, label)
        # Color-code score
        if val >= 70:
            pdf.set_text_color(34, 139, 34)
        elif val >= 40:
            pdf.set_text_color(255, 165, 0)
        else:
            pdf.set_text_color(220, 20, 60)
        pdf.cell(0, 8, f"{val:.1f} / 100", ln=True)
        pdf.set_text_color(0, 0, 0)
    pdf.ln(5)

    # ── Strengths ─────────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(34, 139, 34)
    pdf.cell(0, 10, "Strengths", ln=True)
    pdf.set_draw_color(34, 139, 34)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    for s in report.get("strengths", []):
        pdf.cell(0, 7, f"  + {s}", ln=True)
    pdf.ln(3)

    # ── Weaknesses ────────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(220, 20, 60)
    pdf.cell(0, 10, "Areas for Improvement", ln=True)
    pdf.set_draw_color(220, 20, 60)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    for w in report.get("weaknesses", []):
        pdf.cell(0, 7, f"  - {w}", ln=True)
    pdf.ln(3)

    # ── Suggestions ───────────────────────────────
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(255, 165, 0)
    pdf.cell(0, 10, "Improvement Suggestions", ln=True)
    pdf.set_draw_color(255, 165, 0)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(0, 0, 0)
    for idx, s in enumerate(report.get("improvement_suggestions", []), 1):
        pdf.cell(0, 7, f"  {idx}. {s}", ln=True)
    pdf.ln(5)

    # ── Question-wise Breakdown ───────────────────
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(102, 126, 234)
    pdf.cell(0, 10, "Question-wise Breakdown", ln=True)
    pdf.set_draw_color(102, 126, 234)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(5)

    for idx, qe in enumerate(report.get("question_evaluations", []), 1):
        # Check if we need a new page
        if pdf.get_y() > 230:
            pdf.add_page()

        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(102, 126, 234)
        pdf.cell(0, 8, f"Q{idx}: {qe.get('question', '')[:80]}", ln=True)

        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(0, 0, 0)
        pdf.multi_cell(0, 6, f"Your Answer: {qe.get('answer', 'N/A')[:200]}")
        pdf.ln(1)

        q_scores = qe.get("scores", {})
        pdf.cell(0, 6, f"Score: {q_scores.get('overall_score', 0):.1f}/100  |  "
                       f"Content: {q_scores.get('content_score', 0):.1f}  |  "
                       f"Communication: {q_scores.get('communication_score', 0):.1f}", ln=True)

        matched = ", ".join(qe.get("keywords_matched", [])) or "None"
        missed = ", ".join(qe.get("keywords_missed", [])) or "None"
        pdf.cell(0, 6, f"Keywords Hit: {matched}", ln=True)
        pdf.cell(0, 6, f"Keywords Missed: {missed}", ln=True)

        feedback = qe.get("feedback", "")
        if feedback:
            pdf.set_font("Helvetica", "I", 10)
            pdf.multi_cell(0, 6, f"Feedback: {feedback[:200]}")
        pdf.ln(5)

    # Output
    return pdf.output()
