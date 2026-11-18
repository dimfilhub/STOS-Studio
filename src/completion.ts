/**
 * Completion (the suggestion list while typing) and hover help (mouse over a command) for
 * .stos files, both from the command database.
 */
import * as vscode from 'vscode';
import { loadCommands, helpMarkdown, hoverMarkdown, CommandFinder, CommandKind, isWordName } from './commanddb';

const ICONS: Record<CommandKind, vscode.CompletionItemKind> = {
    keyword: vscode.CompletionItemKind.Keyword,
    function: vscode.CompletionItemKind.Function,
    property: vscode.CompletionItemKind.Property,
    operator: vscode.CompletionItemKind.Operator,
    constructor: vscode.CompletionItemKind.Constructor,
    class: vscode.CompletionItemKind.Class,
};

export function registerCompletionAndHover(context: vscode.ExtensionContext): void {
    // read the database once, when the extension starts
    const commands = loadCommands(context.asAbsolutePath('data/stos-commands.json'));
    // symbols such as "+" or "<>" stay out of the suggestion list; they are in the database for the grammar
    const items = commands.filter(c => isWordName(c.name)).map(c => {
        const item = new vscode.CompletionItem(c.name, ICONS[c.kind]);
        item.detail = c.category;                  // shown next to the name
        const help = helpMarkdown(c);
        if (help) { item.documentation = new vscode.MarkdownString(help); }
        return item;
    });
    const finder = new CommandFinder(commands);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider('stos', {
            provideCompletionItems: () => items,
        }),
        vscode.languages.registerHoverProvider('stos', {
            provideHover(document, position) {
                const match = finder.at(document.lineAt(position.line).text, position.character);
                if (!match) { return undefined; }
                const range = new vscode.Range(position.line, match.start, position.line, match.end);
                return new vscode.Hover(new vscode.MarkdownString(hoverMarkdown(match.entries)), range);
            },
        }));
}
