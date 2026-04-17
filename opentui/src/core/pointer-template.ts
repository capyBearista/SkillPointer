export function buildPointerContent(params: {
  categoryName: string;
  categoryTitle: string;
  count: number;
  libraryPath: string;
}): string {
  return `---
name: ${params.categoryName}-category-pointer
description: Triggers when encountering any task related to ${params.categoryName}. This is a pointer to a library of specialized skills.
---

# ${params.categoryTitle} Capability Library 🎯

You do not have all ${params.categoryTitle} skills loaded immediately in your background context. Instead, you have access to a rich library of ${params.count} highly-specialized skills on your local filesystem.

## Instructions
1. When you need to perform a task related to ${params.categoryName}, you MUST use your file reading tools (like \`list_dir\` and \`view_file\` or \`read_file\`) to browse the hidden library directory: \`${params.libraryPath}\`
2. Locate the specific Markdown files related to the exact sub-task you need.
3. Read the relevant Markdown file(s) into your context.
4. Follow the specific instructions and best practices found within those files to complete the user's request.

## Available Knowledge
This library contains ${params.count} specialized skills covering various aspects of ${params.categoryTitle}.

**Hidden Library Path:** \`${params.libraryPath}\`

*Reminder: Do not guess best practices or blindly search GitHub. Always consult your local library files first.*
`;
}
