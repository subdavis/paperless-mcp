import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { PaperlessAPI } from "../api/PaperlessAPI";
import { errorResult, jsonResult } from "./util";

export function registerCorrespondentTools(server: McpServer, api: PaperlessAPI) {
  server.tool(
    "list_correspondents",
    "Retrieve available correspondents (people, companies, organizations that send/receive documents). Returns names and automatic matching patterns for document assignment. Results are paginated by paperless-ngx (default page size 25); use page/page_size to page through all correspondents, and check the response's 'next' field to see if more pages remain.",
    {
      page: z.number().optional().describe("Page number for pagination (starts at 1). Use to browse beyond the first page of correspondents."),
      page_size: z.number().optional().describe("Number of correspondents per page (paperless-ngx default is 25, max 100)."),
    },
    async (args): Promise<CallToolResult> => {
      try {
        return jsonResult(await api.getCorrespondents(args.page, args.page_size));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "create_correspondent",
    "Create a new correspondent (person, company, or organization) for tracking document senders and receivers. Can include automatic matching patterns for smart assignment to incoming documents.",
    {
      name: z.string().describe("Name of the correspondent (person, company, or organization that sends/receives documents). Examples: 'Bank of America', 'John Smith', 'Electric Company'."),
      match: z.string().optional().describe("Text pattern to automatically assign this correspondent to matching documents. Use names, email addresses, or keywords that appear in documents from this correspondent."),
      matching_algorithm: z
        .enum(["any", "all", "exact", "regular expression", "fuzzy"])
        .optional().describe("How to match text patterns: 'any'=any word matches, 'all'=all words must match, 'exact'=exact phrase match, 'regular expression'=use regex patterns, 'fuzzy'=approximate matching with typos. Default is 'any'."),
    },
    async (args): Promise<CallToolResult> => {
      try {
        return jsonResult(await api.createCorrespondent(args));
      } catch (error) {
        return errorResult(error);
      }
    }
  );

  server.tool(
    "bulk_edit_correspondents",
    "Perform bulk operations on multiple correspondents: set permissions to control who can assign them to documents, or permanently delete multiple correspondents. Use with caution as deletion affects all associated documents.",
    {
      correspondent_ids: z.array(z.number()).describe("Array of correspondent IDs to perform bulk operations on. Use list_correspondents to get valid correspondent IDs."),
      operation: z.enum(["set_permissions", "delete"]).describe("Bulk operation: 'set_permissions' to control who can assign these correspondents to documents, 'delete' to permanently remove correspondents from the system. Warning: Deleting correspondents will remove them from all associated documents."),
      owner: z.number().optional().describe("User ID to set as owner when operation is 'set_permissions'. The owner has full control over these correspondents."),
      permissions: z
        .object({
          view: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can see and assign these correspondents to documents"),
            groups: z.array(z.number()).optional().describe("Group IDs who can see and assign these correspondents to documents"),
          }).describe("Users and groups with permission to view and use these correspondents"),
          change: z.object({
            users: z.array(z.number()).optional().describe("User IDs who can modify correspondent details (name, matching rules)"),
            groups: z.array(z.number()).optional().describe("Group IDs who can modify correspondent details"),
          }).describe("Users and groups with permission to edit these correspondent settings"),
        })
        .optional().describe("Permission settings when operation is 'set_permissions'. Defines who can view/assign and modify these correspondents."),
      merge: z.boolean().optional().describe("Whether to merge with existing permissions (true) or replace them entirely (false). Default is false."),
    },
    async (args): Promise<CallToolResult> => {
      try {
        const result = await api.bulkEditObjects(
          args.correspondent_ids,
          "correspondents",
          args.operation,
          args.operation === "set_permissions"
            ? { owner: args.owner, permissions: args.permissions, merge: args.merge }
            : {}
        );
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    }
  );
}
