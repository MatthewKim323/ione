# agents/

The three-agent system. Each agent does one job. Tune in this order: OCR first, then Reasoning, then Intervention.

## Layout

```
agents/
├── ocr/             Visual page-understanding agent
│   ├── prompt.ts    System prompt (string constant)
│   ├── agent.ts     runOcrAgent(screenshot, latexFromMathpix) → structured JSON
│   └── types.ts     OcrAgentOutput type
│
├── reasoning/       Canonical solution + evaluate student work
│   ├── prompt.ts    Both call A (canonical) and call B (evaluate) prompts
│   ├── agent.ts     solveCanonical(...) and evaluateStudent(...)
│   └── types.ts     CanonicalSolution, ReasoningOutput types
│
└── intervention/    The hard one. Decides whether to speak.
    ├── prompt.ts    The 200-line system prompt with decision rules
    ├── agent.ts     decideIntervention(reasoning, recentHints, profile, ...)
    └── types.ts     InterventionOutput type
```

## Per-agent contracts

### OCR
- Input: PNG (base64) + LaTeX string from Mathpix
- Output: `{ problem_text, current_step_latex, completed_steps_latex, page_state, confidence, ... }`
- Frequency: every capture cycle when local diff says something changed

### Reasoning
- **Call A (once per new problem):** problem text → `{ final_answer, solution_steps[], common_errors[], topic, difficulty }`
- **Call B (every cycle):** student work + cached canonical → `{ step_status, error_type, severity, scaffolding_question, matches_known_error_pattern }`

### Intervention
- Input: reasoning output + recent hints + cooldown state + struggle profile + stalled flag
- Output: `{ should_speak, hint_text, hint_type, memory_to_write, reasoning_for_decision }`
- **Bias hard toward silence.** Default is "do not speak." Decision rules cascade in numbered order — do not break the cascade.

## What never to cut from the prompts

1. The "be skeptical of errors" rule in Reasoning Agent
2. The cooldown logic in Intervention Agent
3. The struggle-profile injection in Intervention rule 8

These three are the difference between a tutor judges fall in love with and a Clippy that gets thumbs-downed.
