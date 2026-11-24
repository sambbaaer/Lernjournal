import { z } from 'zod';
import { JournalDetailSchema, JournalId } from './journal';

export const MCP_PORT = 47651;

const EditPreviewSchema = z.object({ section: z.string(), before: z.string().nullable(), after: z.string() });

export const McpProposalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('edit'), id: z.uuid(), title: z.string(), changes: z.array(EditPreviewSchema) }),
  z.object({ kind: z.literal('link'), id: z.uuid(), title: z.string(), targetTitle: z.string() }),
  z.object({
    kind: z.literal('draft'),
    id: z.uuid(),
    title: z.string(),
    changes: z.array(EditPreviewSchema),
  }),
]);

export const McpStatusSchema = z.object({
  endpoint: z.string().nullable(),
  allowDrafts: z.boolean(),
  proposals: z.array(McpProposalSchema),
});

export const McpDecisionSchema = z.object({ id: z.uuid(), apply: z.boolean() });
export const McpDecisionResultSchema = z.object({
  journal: JournalDetailSchema.nullable(),
  relatedId: JournalId.nullable(),
});

export type McpStatus = z.infer<typeof McpStatusSchema>;
export type McpProposal = z.infer<typeof McpProposalSchema>;
export type McpDecisionResult = z.infer<typeof McpDecisionResultSchema>;
export const MCP_OFF: McpStatus = { endpoint: null, allowDrafts: false, proposals: [] };
