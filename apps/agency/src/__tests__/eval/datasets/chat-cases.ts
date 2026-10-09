/**
 * Golden test cases for Atlas chat evaluation.
 *
 * Each case provides a user message, system prompt context, and expected
 * quality constraints for the AI response.
 */

import type { EvalTestCase, ChatTestInput, ChatExpected } from "../framework/types";

// ---------------------------------------------------------------------------
// Shared context snippets (simulating buildAtlasSystemPrompt output)
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are Atlas, an AI visa application assistant. You help users prepare their visa applications by answering questions about visa requirements, analyzing their documents, and providing guidance.

## Current Application
- Visa Type: Tourist / Visitor (B1/B2)
- Home Country: Bangladesh
- Destination: United States
- Embassy: US Embassy Dhaka
- Status: In Progress

## Applicant
- Name: Rashid Ahmed
- Date of Birth: 1990-05-15
- Passport: AB1234567 (expires 2030-12-31)

## Rules
- ONLY answer questions related to visa and immigration
- Reference the applicant's specific documents and situation
- Cite official sources when discussing requirements
- Never say "I don't have information" — use the context provided
- If a question is outside visa/immigration scope, politely decline`;

const DOCUMENT_CONTEXT = `## Uploaded Documents

### Passport (Valid)
PASSPORT - People's Republic of Bangladesh
Surname: AHMED, Given Names: RASHID
Passport No: AB1234567
Date of Birth: 15 MAY 1990
Date of Issue: 01 JAN 2025
Date of Expiry: 31 DEC 2030
Nationality: BANGLADESHI

### Bank Statement
Account Holder: RASHID AHMED
Bank: BRAC Bank Limited
Period: Apr 2026 – Sep 2026
Opening Balance: BDT 520,000
Closing Balance: BDT 890,000
Average Monthly Balance: BDT 705,000
Monthly salary: BDT 120,000 from DataSoft Systems Bangladesh Ltd

### Employment Letter
This is to certify that Mr. Rashid Ahmed has been employed at DataSoft Systems Bangladesh Ltd as Lead Software Engineer since January 2019.
Annual Salary: BDT 1,440,000
He has been granted leave from 1 October 2026 to 18 October 2026.`;

const EVALUATION_CONTEXT = `## Latest AI Evaluation
- Overall Score: 72/100
- Risk Level: Medium
- Summary: Application shows reasonable preparation but financial documentation could be stronger.
- Red Flags: Bank balance may be insufficient for 3-week US visit
- Recommendations: Provide additional financial evidence such as fixed deposits or property documents`;

const CITATIONS_CONTEXT = `## Official Sources
- US Department of State - Visitor Visa: https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html
- DS-160 Application: https://ceac.state.gov/genniv/
- Embassy Dhaka: https://bd.usembassy.gov/visas/`;

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export const chatCases: EvalTestCase<ChatTestInput, ChatExpected>[] = [
  {
    id: "direct-requirement-question",
    description: "Direct factual question about US tourist visa requirements",
    input: {
      message: "What documents do I need for my US tourist visa interview?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + CITATIONS_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["passport", "DS-160", "photo", "interview"],
      mustCiteSources: true,
    },
    context: CITATIONS_CONTEXT,
    metadata: { category: "factual", difficulty: "easy" },
  },
  {
    id: "document-specific-question",
    description: "Question about a specific uploaded document — should reference context",
    input: {
      message: "Is my passport valid enough for the visa application?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + DOCUMENT_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["2030", "valid"],
    },
    context: DOCUMENT_CONTEXT,
    metadata: { category: "document-analysis", difficulty: "medium" },
  },
  {
    id: "off-topic-recipe",
    description: "Off-topic question about cooking — should refuse",
    input: {
      message: "Can you give me a recipe for chicken biryani?",
      systemPrompt: BASE_SYSTEM_PROMPT,
    },
    expected: {
      shouldRefuse: true,
    },
    metadata: { category: "refusal", difficulty: "easy" },
  },
  {
    id: "off-topic-code",
    description: "Off-topic question about programming — should refuse",
    input: {
      message: "Write me a Python script to sort a list of numbers",
      systemPrompt: BASE_SYSTEM_PROMPT,
    },
    expected: {
      shouldRefuse: true,
    },
    metadata: { category: "refusal", difficulty: "easy" },
  },
  {
    id: "financial-strength-question",
    description:
      "Question about financial readiness — should reference bank statement and evaluation",
    input: {
      message: "Do I have enough funds in my bank account for the visa?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + DOCUMENT_CONTEXT + "\n\n" + EVALUATION_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["890,000", "financial"],
    },
    context: DOCUMENT_CONTEXT + "\n" + EVALUATION_CONTEXT,
    metadata: { category: "document-analysis", difficulty: "medium" },
  },
  {
    id: "evaluation-score-question",
    description: "Question about their evaluation score — should reference latest evaluation",
    input: {
      message: "What is my current application score and what can I do to improve it?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + EVALUATION_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["72", "medium"],
    },
    context: EVALUATION_CONTEXT,
    metadata: { category: "evaluation", difficulty: "medium" },
  },
  {
    id: "follow-up-context",
    description: "Follow-up question requiring conversation history context",
    input: {
      message: "What about the employment letter? Is it strong enough?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + DOCUMENT_CONTEXT,
      conversationHistory: [
        {
          role: "user",
          content: "Can you review my uploaded documents?",
        },
        {
          role: "assistant",
          content:
            "I can see you've uploaded your passport, bank statement, and employment letter. Your passport is valid until December 2030, which gives you plenty of validity. Your bank statement shows a closing balance of BDT 890,000. Let me know which document you'd like me to review in detail.",
        },
      ],
    },
    expected: {
      mustContainKeywords: ["leave", "engineer"],
    },
    context: DOCUMENT_CONTEXT,
    metadata: { category: "follow-up", difficulty: "medium" },
  },
  {
    id: "applicant-specific-advice",
    description: "Question about applicant's specific situation — should give personalised advice",
    input: {
      message:
        "Given my profile as a software engineer from Bangladesh, what are my chances of getting the visa?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + DOCUMENT_CONTEXT + "\n\n" + EVALUATION_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["engineer", "employment"],
    },
    context: DOCUMENT_CONTEXT + "\n" + EVALUATION_CONTEXT,
    metadata: { category: "personalised", difficulty: "hard" },
  },
  {
    id: "citation-requirement-question",
    description: "Question about official requirements — should cite official sources",
    input: {
      message: "Where can I find the official DS-160 form and what are the exact requirements?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + CITATIONS_CONTEXT,
    },
    expected: {
      mustCiteSources: true,
      mustContainKeywords: ["DS-160", "ceac.state.gov"],
    },
    context: CITATIONS_CONTEXT,
    metadata: { category: "citation", difficulty: "medium" },
  },
  {
    id: "expiry-alert-question",
    description: "Question about document expiry — should reference passport expiry",
    input: {
      message: "Are any of my documents expiring soon?",
      systemPrompt: BASE_SYSTEM_PROMPT + "\n\n" + DOCUMENT_CONTEXT,
    },
    expected: {
      mustContainKeywords: ["2030", "passport"],
    },
    context: DOCUMENT_CONTEXT,
    metadata: { category: "document-analysis", difficulty: "easy" },
  },
];
