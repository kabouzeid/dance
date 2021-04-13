import { writeFile } from "fs/promises";

import { getCommandModules, parseDocComments } from "./src/meta";

// Shared values
// ============================================================================

const commandType = {
  type: "array",
  items: {
    type: ["array", "object", "string"],
    properties: {
      command: {
        type: "string",
      },
      args: {},
    },
    required: ["command"],
  },
};

const builtinModesAreDeprecatedMessage =
  "Built-in modes are deprecated. Use `#dance.modes#` instead.";

const modeNamePattern = {
  pattern: /^[a-zA-Z]\w*$/.source,
  patternErrorMessage: "",
};

const colorPattern = {
  pattern: /^(#[a-fA-F0-9]{3}|#[a-fA-F0-9]{6}|#[a-fA-F0-9]{8}|\$([a-zA-Z]+(\.[a-zA-Z]+)+))$/.source,
  patternErrorMessage: "Color should be an hex color or a '$' sign followed by a color identifier.",
};

const selectionDecorationType = {
  type: "object",
  properties: {
    applyTo: {
      enum: ["all", "main", "secondary"],
      default: "all",
      description: "The selections to apply this style to.",
      enumDescriptions: [
        "Apply to all selections.",
        "Apply to main selection only.",
        "Apply to all selections except main selection.",
      ],
    },
    backgroundColor: {
      type: "string",
      ...colorPattern,
    },
    borderColor: {
      type: "string",
      ...colorPattern,
    },
    borderStyle: {
      type: "string",
    },
    borderWidth: {
      type: "string",
    },
    borderRadius: {
      type: "string",
    },
    isWholeLine: {
      type: "boolean",
      default: false,
    },
  },
};

// Package information
// ============================================================================

const pkg = (modules: parseDocComments.ParsedModule<void>[]) => ({

  // Common package.json properties.
  // ==========================================================================

  name: "dance",
  description: "Make those cursors dance with Kakoune-inspired keybindings.",
  version: "0.4.2",
  license: "ISC",

  author: {
    name: "Grégoire Geis",
    email: "opensource@gregoirege.is",
  },

  repository: {
    type: "git",
    url: "https://github.com/71/dance.git",
  },

  main: "./out/src/extension.js",

  engines: {
    vscode: "^1.44.0",
  },

  scripts: {
    "check": "eslint .",
    "format": "eslint . --fix",
    "generate": "ts-node ./src/meta.ts && ts-node ./package.ts",
    "vscode:prepublish": "yarn run generate && yarn run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "yarn run compile && node ./out/test/run.js",
    "package": "vsce package",
    "publish": "vsce publish",
  },

  devDependencies: {
    "@types/glob": "^7.1.1",
    "@types/mocha": "^8.0.3",
    "@types/node": "^14.6.0",
    "@types/vscode": "^1.44.0",
    "@typescript-eslint/eslint-plugin": "^4.18.0",
    "@typescript-eslint/parser": "^4.18.0",
    "eslint": "^7.22.0",
    "glob": "^7.1.6",
    "mocha": "^8.1.1",
    "source-map-support": "^0.5.19",
    "ts-node": "^9.1.1",
    "typescript": "^4.2.4",
    "unexpected": "^12.0.0",
    "vsce": "^1.87.0",
    "vscode-test": "^1.3.0",
  },

  // VS Code-specific properties.
  // ==========================================================================

  displayName: "Dance",
  publisher: "gregoire",
  categories: ["Keymaps", "Other"],
  readme: "README.md",

  activationEvents: ["*"],
  extensionKind: ["ui", "workspace"],

  // Dance-specific properties.
  // ==========================================================================

  // The two properties below can be set when distributing Dance to ensure it
  // cannot execute arbitrary code (with `dance.run`) or system commands (with
  // `dance.selections.{filter,pipe}`).
  "dance.disableArbitraryCodeExecution": false,
  "dance.disableArbitraryCommandExecution": false,

  contributes: {

    // Configuration.
    // ========================================================================

    configuration: {
      type: "object",
      title: "Dance",
      properties: {
        "dance.defaultMode": {
          type: "string",
          scope: "language-overridable",
          default: "normal",
          description: "Controls which mode is set by default when an editor is opened.",
          ...modeNamePattern,
        },
        "dance.modes": {
          type: "object",
          scope: "language-overridable",
          additionalProperties: {
            type: "object",
            propertyNames: modeNamePattern,
            properties: {
              inheritFrom: {
                type: ["string", "null"],
                description:
                  "Controls how default configuration options are obtained for this mode. "
                  + "Specify a string to inherit from the mode with the given name, "
                  + "and null to inherit from the VS Code configuration.",
                ...modeNamePattern,
              },
              cursorStyle: {
                enum: [
                  "line",
                  "block",
                  "underline",
                  "line-thin",
                  "block-outline",
                  "underline-thin",
                  "inherit",
                  null,
                ],
                description: "Controls the cursor style.",
              },
              lineHighlight: {
                type: ["string", "null"],
                markdownDescription:
                  "Controls the line highlighting applied to active lines. "
                  + "Can be an hex color, a [theme color]("
                  + "https://code.visualstudio.com/api/references/theme-color) or null.",
                ...colorPattern,
              },
              lineNumbers: {
                enum: ["off", "on", "relative", "inherit", null],
                description: "Controls the display of line numbers.",
                enumDescriptions: [
                  "No line numbers.",
                  "Absolute line numbers.",
                  "Relative line numbers.",
                  "Inherit from `editor.lineNumbers`.",
                ],
              },
              onEnterMode: {
                ...commandType,
                description:
                  "Controls what commands should be executed upon entering this mode.",
              },
              onLeaveMode: {
                ...commandType,
                description:
                  "Controls what commands should be executed upon leaving this mode.",
              },
              selectionBehavior: {
                enum: ["caret", "character", null],
                default: "caret",
                description: "Controls how selections behave within VS Code.",
                markdownEnumDescriptions: [
                  "Selections are anchored to carets, which is the native VS Code behavior; "
                  + "that is, they are positioned *between* characters and can therefore be "
                  + "empty.",
                  "Selections are anchored to characters, like Kakoune; that is, they are "
                  + "positioned *on* characters, and therefore cannot be empty. "
                  + "Additionally, one-character selections will behave as if they were "
                  + "non-directional, like Kakoune.",
                ],
              },
              decorations: {
                ...selectionDecorationType,
                type: ["array", "object", "null"],
                description: "The decorations to apply to selections.",
                items: selectionDecorationType,
              },
            },
            additionalProperties: false,
          },
          default: {
            insert: {},
            normal: {
              lineNumbers: "relative",
              decorations: {
                applyTo: "main",
                backgroundColor: "$editor.hoverHighlightBackground",
                isWholeLine: true,
              },
              onEnterMode: [
                [".selections.restore", { register: " ^", try: true }],
              ],
              onLeaveMode: [
                [".selections.save", {
                  register: " ^",
                  style: {
                    borderColor: "$editor.selectionBackground",
                    borderStyle: "solid",
                    borderWidth: "2px",
                    borderRadius: "1px",
                  },
                  until: [
                    ["mode-did-change", { include: "normal" }],
                    ["selections-did-change"],
                  ],
                }],
              ],
            },
          },
          description: "Controls the different modes available in Dance.",
        },

        "dance.menus": {
          type: "object",
          scope: "language-overridable",
          description: "Controls the different menus available in Dance.",
          additionalProperties: {
            type: "object",
            properties: {
              items: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "Text shown in the menu.",
                    },
                    command: {
                      type: "string",
                      description: "Command to execute on item selection.",
                    },
                    args: {
                      type: "array",
                      description: "Arguments to the command to execute.",
                    },
                  },
                  required: ["command"],
                },
              },
            },
            additionalProperties: false,
          },
          default: {
            "object": {
              items: ((command = "dance.objects.performSelection") => ({
                "b()": {
                  command,
                  args: [{ object: "parens" }],
                  text: "parenthesis block",
                },
                "B{}": {
                  command,
                  args: [{ object: "braces" }],
                  text: "braces block",
                },
                "r[]": {
                  command,
                  args: [{ object: "brackets" }],
                  text: "brackets block",
                },
                "a<>": {
                  command,
                  args: [{ object: "angleBrackets" }],
                  text: "angle block",
                },
                'Q"': {
                  command,
                  args: [{ object: "doubleQuoteString" }],
                  text: "double quote string",
                },
                "q'": {
                  command,
                  args: [{ object: "singleQuoteString" }],
                  text: "single quote string",
                },
                "g`": {
                  command,
                  args: [{ object: "graveQuoteString" }],
                  text: "grave quote string",
                },
                "w": {
                  command,
                  args: [{ object: "word" }],
                  text: "word",
                },
                "W": {
                  command,
                  args: [{ object: "WORD" }],
                  text: "WORD",
                },
                "s": {
                  command,
                  args: [{ object: "sentence" }],
                  text: "sentence",
                },
                "p": {
                  command,
                  args: [{ object: "paragraph" }],
                  text: "paragraph",
                },
                " ": {
                  command,
                  args: [{ object: "whitespaces" }],
                  text: "whitespaces",
                },
                "i": {
                  command,
                  args: [{ object: "indent" }],
                  text: "indent",
                },
                "n": {
                  command,
                  args: [{ object: "number" }],
                  text: "number",
                },
                "u": {
                  command,
                  args: [{ object: "argument" }],
                  text: "argument",
                },
                "c": {
                  command,
                  args: [{ object: "custom" }],
                  text: "custom object desc",
                },
              }))(),
            },

            "goto": {
              items: {
                "h": {
                  text: "to line start",
                  command: "dance.select.lineStart",
                },
                "l": {
                  text: "to line end",
                  command: "dance.select.lineEnd",
                },
                "i": {
                  text: "to non-blank line start",
                  command: "dance.select.lineStart",
                  args: [{ skipBlank: true }],
                },
                "gk": {
                  text: "to first line",
                  command: "dance.select.lineStart",
                  args: [{ count: 0 }],
                },
                "j": {
                  text: "to last line",
                  command: "dance.select.lastLine",
                },
                "e": {
                  text: "to last char of last line",
                  command: "dance.select.lineEnd",
                  args: [{ count: 2_147_483_647 }],
                },
                "t": {
                  text: "to first displayed line",
                  command: "dance.select.firstVisibleLine",
                },
                "c": {
                  text: "to middle displayed line",
                  command: "dance.select.middleVisibleLine",
                },
                "b": {
                  text: "to last displayed line",
                  command: "dance.select.lastVisibleLine",
                },
                "f": {
                  text: "to file whose name is selected",
                  command: "dance.selections.open",
                },
                ".": {
                  text: "to last buffer modification position",
                  command: "dance.select.lastModification",
                },
              },
            },
          } as Record<string,
                      { items: Record<string, { text: string; command: string; args?: any[] }>}>,
        },

        // Deprecated configuration:
        "dance.enabled": {
          type: "boolean",
          default: true,
          description: "Controls whether the Dance keybindings are enabled.",
          deprecationMessage: "dance.enabled is deprecated; disable the Dance extension instead.",
        },

        "dance.normalMode.lineHighlight": {
          type: ["string", "null"],
          default: "editor.hoverHighlightBackground",
          markdownDescription:
            "Controls the line highlighting applied to active lines in normal mode. "
            + "Can be an hex color, a [theme color]("
            + "https://code.visualstudio.com/api/references/theme-color) or null.",
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.insertMode.lineHighlight": {
          type: ["string", "null"],
          default: null,
          markdownDescription:
            "Controls the line highlighting applied to active lines in insert mode. "
            + "Can be an hex color, a [theme color]("
            + "https://code.visualstudio.com/api/references/theme-color) or null.",
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.normalMode.lineNumbers": {
          enum: ["off", "on", "relative", "inherit"],
          default: "relative",
          description: "Controls the display of line numbers in normal mode.",
          enumDescriptions: [
            "No line numbers.",
            "Absolute line numbers.",
            "Relative line numbers.",
            "Inherit from `editor.lineNumbers`.",
          ],
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.insertMode.lineNumbers": {
          enum: ["off", "on", "relative", "inherit"],
          default: "inherit",
          description: "Controls the display of line numbers in insert mode.",
          enumDescriptions: [
            "No line numbers.",
            "Absolute line numbers.",
            "Relative line numbers.",
            "Inherit from `editor.lineNumbers`.",
          ],
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.normalMode.cursorStyle": {
          enum: [
            "line",
            "block",
            "underline",
            "line-thin",
            "block-outline",
            "underline-thin",
            "inherit",
          ],
          default: "inherit",
          description: "Controls the cursor style in normal mode.",
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.insertMode.cursorStyle": {
          enum: [
            "line",
            "block",
            "underline",
            "line-thin",
            "block-outline",
            "underline-thin",
            "inherit",
          ],
          default: "inherit",
          description: "Controls the cursor style in insert mode.",
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.insertMode.selectionStyle": {
          type: "object",
          default: {
            borderColor: "$editor.selectionBackground",
            borderStyle: "solid",
            borderWidth: "2px",
            borderRadius: "1px",
          },
          description: "The style to apply to selections in insert mode.",
          properties: (Object as any).fromEntries(
            [
              "backgroundColor",
              "borderColor",
              "borderStyle",
              "borderWidth",
              "borderRadius",
            ].map((x) => [x, { type: "string" }]),
          ),
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
        "dance.selectionBehavior": {
          enum: ["caret", "character"],
          default: "caret",
          description: "Controls how selections behave within VS Code.",
          markdownEnumDescriptions: [
            "Selections are anchored to carets, which is the native VS Code behavior; that is, "
            + "they are positioned *between* characters and can therefore be empty.",
            "Selections are anchored to characters, like Kakoune; that is, they are positioned "
            + "*on* characters, and therefore cannot be empty. Additionally, one-character "
            + "selections will behave as if they were non-directional, like Kakoune.",
          ],
          markdownDeprecationMessage: builtinModesAreDeprecatedMessage,
        },
      },
    },

    // Commands.
    // ========================================================================

    commands: modules.flatMap((module) => module.commands.map((x) => ({
      command: x.id,
      title: x.title,
      category: "Dance",
    }))),

    // Keybindings.
    // ========================================================================

    keybindings: (() => {
      const keybindings = modules.flatMap((module) => module.keybindings),
            alphanum = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"],
            keysToAssign = new Set([...alphanum, ...alphanum.map((x) => `Shift+${x}`), ...",'"]);

      for (const keybinding of keybindings) {
        keysToAssign.delete(keybinding.key);
      }

      for (const keyToAssign of keysToAssign) {
        keybindings.push({
          command: "dance.ignore",
          key: keyToAssign,
          when: "editorTextFocus && dance.mode == 'normal'",
        });
      }

      return keybindings;
    })(),
  },
});

// Save to package.json
// ============================================================================

async function save() {
  await writeFile(
    `${__dirname}/package.json`,
    JSON.stringify(pkg(await getCommandModules()), undefined, 2) + "\n",
    "utf-8",
  );
}

save();
