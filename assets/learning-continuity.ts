import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { memorySummary, recordEvidence } from "./learning-state.mjs";

export default function learningContinuity(pi: ExtensionAPI) {
  let injected = "";
  pi.on("session_start", async () => { injected = ""; });
  pi.on("before_agent_start", async (_event, ctx) => {
    const summary = memorySummary(ctx.cwd);
    if (summary === injected) return;
    injected = summary;
    return { message: { customType: "learning-memory", content: summary, display: false } };
  });
  pi.registerTool({
    name: "learning_record",
    label: "Record Learning Evidence",
    description: "Persist evidence from an actual learner response or a newly introduced concept. Updates Progress.md and Review.md for future lessons. Record correct only after an observed correct answer; introduced is not an assessment. Expected answers stay out of the review note. Do not fabricate results or mark a concept mastered.",
    parameters: Type.Object({
      topic: Type.String(), concept: Type.String(),
      outcome: Type.Union([Type.Literal("correct"), Type.Literal("incorrect"), Type.Literal("unsure"), Type.Literal("introduced")]),
      evidence: Type.String({ description: "Brief actual answer/behaviour supporting this assessment" }),
      misconception: Type.Optional(Type.String()), nextStep: Type.String(),
      reviewQuestion: Type.String(), expectedAnswer: Type.String(),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const record = recordEvidence(ctx.cwd, params);
      return { content: [{ type: "text", text: `Recorded ${record.topic} / ${record.concept}: ${record.status}. Review suggested ${record.nextReview}. Updated Progress.md and Review.md.` }],
               details: { status: record.status, nextReview: record.nextReview } };
    },
  });
  pi.registerCommand("learning-progress", {
    description: "Show learning progress and due reviews",
    handler: async (_args, ctx) => { ctx.ui.notify(memorySummary(ctx.cwd), "info"); },
  });
  pi.registerCommand("lesson-end", {
    description: "Save learning evidence and next steps before ending the lesson",
    handler: async () => {
      pi.sendUserMessage("Finish this lesson: use learning_record for any important evidence from my actual answers that has not been saved. Do not invent results. Briefly summarize what I demonstrated, remaining gaps, and one next step. Then stop teaching.");
    },
  });
}
