"""Extract structured insights from free-form brief markdown.

These helpers pull "key takeaways" bullet lists and "other-city example"
phrases out of brief content so they can be surfaced on portfolio deep-dive
slides without requiring an extra LLM call.
"""

import re
from typing import Dict, List


def extract_key_takeaways(brief_markdown: str) -> List[str]:
    """Extract key takeaways from brief markdown content.

    Looks for sections like "Key Takeaways", "Key Findings", "Key Implications",
    "What This Means", bullet points, or numbered lists.
    """
    takeaways: List[str] = []

    key_section_patterns = [
        r"(?:##?\s*)?(?:Key\s+)?(?:Takeaways?|Findings?|Implications?|Insights?)[\s:]*\n((?:[-•*]\s*.+\n?)+)",
        r"(?:##?\s*)?What\s+This\s+Means[^:]*:?\s*\n((?:[-•*]\s*.+\n?)+)",
        r"(?:##?\s*)?Strategic\s+(?:Implications?|Considerations?)[\s:]*\n((?:[-•*]\s*.+\n?)+)",
    ]

    for pattern in key_section_patterns:
        matches = re.findall(pattern, brief_markdown, re.IGNORECASE | re.MULTILINE)
        for match in matches:
            bullets = re.findall(r"[-•*]\s*(.+?)(?:\n|$)", match)
            takeaways.extend([b.strip() for b in bullets if len(b.strip()) > 20])

    if not takeaways:
        if summary_match := re.search(
            r"(?:##?\s*)?(?:Executive\s+)?Summary[\s:]*\n(.+?)(?:\n##|\n\n\n|$)",
            brief_markdown,
            re.IGNORECASE | re.DOTALL,
        ):
            summary = summary_match.group(1)
            sentences = re.split(r"(?<=[.!?])\s+", summary)
            takeaways = [s.strip() for s in sentences[:3] if len(s.strip()) > 30]

    return takeaways[:5]


def extract_city_examples(brief_markdown: str) -> List[Dict[str, str]]:
    """Extract examples of other cities, projects, or implementations.

    Returns list of dicts with 'city', 'project', and 'detail' keys.
    """
    examples: List[Dict[str, str]] = []

    city_patterns = [
        r"(?:City\s+of\s+|The\s+)?([\w\s]+?)(?:\s+has|\s+is|\s+launched|\s+implemented|\s+deployed|\s+piloted|\s+tested)\s+(.+?)(?:\.|,\s+(?:which|resulting|leading))",
        r"In\s+([\w\s,]+?),\s+(?:they|the\s+city|officials|government)\s+(?:have|has)\s+(.+?)(?:\.|,)",
        r"([\w\s]+?)'s\s+([\w\s]+?(?:program|initiative|project|pilot|system))\s+(.+?)(?:\.|,)",
        r"(?:programs?|initiatives?|projects?)\s+(?:like|such\s+as)\s+(.+?)\s+in\s+([\w\s]+?)(?:\.|,|$)",
    ]

    for pattern in city_patterns:
        matches = re.findall(pattern, brief_markdown, re.IGNORECASE)
        for match in matches:
            if len(match) >= 2:
                city = match[0].strip() if match[0] else ""
                detail = match[1].strip() if len(match) > 1 else ""
                project = match[2].strip() if len(match) > 2 else ""

                skip_terms = [
                    "the",
                    "this",
                    "that",
                    "these",
                    "those",
                    "austin",
                    "texas",
                ]
                if city.lower() not in skip_terms and len(city) > 2:
                    examples.append(
                        {
                            "city": city,
                            "project": project,
                            "detail": detail[:150] if detail else "",
                        }
                    )

    seen_cities = set()
    unique_examples: List[Dict[str, str]] = []
    for ex in examples:
        city_lower = ex["city"].lower()
        if city_lower not in seen_cities:
            seen_cities.add(city_lower)
            unique_examples.append(ex)

    return unique_examples[:4]
