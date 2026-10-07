import { z } from 'zod';
import { LEVELS } from './rules.js';

const Cit = z.array(z.string()).min(1);

export const Out = z.object({
  causes: z.array(
    z.object({
      cause: z.string(),
      confidence: z.enum(['low', 'medium', 'high']),
      why: z.string(),
      citations: Cit
    })
  ).min(1),

  questions: z.array(
    z.object({
      q: z.string()
    })
  ),

  inspection: z.array(
    z.object({
      step: z.string(),
      citations: Cit
    })
  ).min(1),

  priority: z.object({
    level: z.enum(LEVELS),
    reason: z.string(),
    citations: Cit
  }),

  workOrder: z.object({
    title: z.string(),
    description: z.string(),
    tasks: z.array(z.string()).min(1)
  })
});


export function checkCitations(out, allowed) {
  const all = [
    ...out.causes.flatMap(c => c.citations),
    ...out.inspection.flatMap(i => i.citations),
    ...out.priority.citations
  ];

  const bad = all.filter(c => !allowed.has(c));

  if (bad.length) {
    throw new Error(
      'AI cited unknown sources: ' +
      [...new Set(bad)].join(', ')
    );
  }
}


/* ----------------------------- */
/* Gemini retry helper            */
/* ----------------------------- */

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));


/* ----------------------------- */
/* Gemini AI                     */
/* ----------------------------- */

export async function callModel(prompt) {
  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    throw Object.assign(
      new Error('GEMINI_API_KEY is not set on the server.'),
      {
        code: 'LLM_NOT_CONFIGURED'
      }
    );
  }

  /*
   * First model:
   *   MODEL environment variable
   *   otherwise gemini-flash-latest
   *
   * Backup model:
   *   MODEL_FALLBACK environment variable
   *   otherwise gemini-2.5-flash
   */
  const models = [
        process.env.MODEL || 'gemini-3.1-flash-lite',
    process.env.MODEL_FALLBACK || 'gemini-flash-lite-latest'
  ];

  let last;

  /*
   * Try each model.
   */
  for (const model of [...new Set(models)]) {

    /*
     * Try each model up to 3 times.
     */
    for (let attempt = 1; attempt <= 2; attempt++) {

      let res;

      try {
        res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',

            headers: {
              'content-type': 'application/json',
              'x-goog-api-key': key
            },

            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: prompt
                    }
                  ]
                }
              ],

              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
              }
            }),

            signal: AbortSignal.timeout(90000)
          }
        );

      } catch (e) {

        last = Object.assign(
          new Error(
            'Could not reach the AI service: ' + e.message
          ),
          {
            code: 'LLM_UNREACHABLE'
          }
        );

        await sleep(1500 * attempt);

        continue;
      }


      /*
       * Successful response
       */
      if (res.ok) {

        const data = await res.json();

        const text =
          data.candidates?.[0]?.content?.parts
            ?.map(p => p.text || '')
            .join('') || '';


        /*
         * Find the JSON object in the response.
         */
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');

        const json =
          start !== -1 && end !== -1
            ? text.slice(start, end + 1)
            : text;


        try {
          return JSON.parse(json);

        } catch {
          throw Object.assign(
            new Error('AI returned invalid JSON'),
            {
              code: 'LLM_BAD_OUTPUT'
            }
          );
        }
      }


      /*
       * Request failed.
       */
      const detail = (
        await res.text().catch(() => '')
      ).slice(0, 200);


      console.error(
        `Gemini ${model} attempt ${attempt}: ${res.status} ${detail}`
      );


      last = Object.assign(
        new Error(
          `AI service returned ${res.status} (model ${model}). ${
            [429, 503].includes(res.status)
              ? 'The AI service is busy or over quota. Try again shortly.'
              : 'Check your API key and model name.'
          }`
        ),
        {
          code: 'LLM_HTTP_ERROR'
        }
      );


      /*
       * For errors that are not temporary,
       * don't retry the same model.
       */
      if (
        ![429, 500, 502, 503, 504].includes(res.status)
      ) {
        break;
      }


      /*
       * Wait before retrying.
       */
      await sleep(2000 * attempt);
    }
  }


  /*
   * All models and retries failed.
   */
  throw last;
}


/* ----------------------------- */
/* Prompt builder                 */
/* ----------------------------- */

export const buildPrompt = (r, hits, rules) => `
You assist a maintenance technician.

You never control equipment and never approve work.

Rules:
- Causes are POSSIBLE, never confirmed.
- Every cause, inspection step and the priority MUST cite source ids from the list below.
- Use ONLY these source ids.
- Do not invent citation ids.
- Return ONLY valid JSON.
- Do not include markdown or explanations outside the JSON.

Equipment:
${r.type} ${r.equipmentId}

Issue [issue]:
${r.issue}

Events:
${
  r.events.map(
    (e, i) => `[event:${i + 1}] ${e}`
  ).join(' | ') || 'none'
}

Threshold checks:
${
  rules.checks.map(
    c =>
      `[rule:${c.key}] ${c.label} ${c.value}${c.unit} = ${c.level}`
  ).join(' | ') || 'none'
}

Data problems:
${
  rules.notes.map(
    n => n.msg
  ).join(' | ') || 'none'
}

Manual sections:
${
  hits.map(
    h => `[${h.id}] ${h.title}: ${h.text}`
  ).join('\n') || 'none matched'
}

Return ONLY JSON in exactly this structure:

{
  "causes": [
    {
      "cause": "possible cause",
      "confidence": "low|medium|high",
      "why": "explanation",
      "citations": ["source-id"]
    }
  ],

  "questions": [
    {
      "q": "question for technician"
    }
  ],

  "inspection": [
    {
      "step": "inspection step",
      "citations": ["source-id"]
    }
  ],

  "priority": {
    "level": "Low|Medium|High|Urgent",
    "reason": "reason for priority",
    "citations": ["source-id"]
  },

  "workOrder": {
    "title": "work order title",
    "description": "work order description",
    "tasks": [
      "task 1",
      "task 2"
    ]
  }
}
`;