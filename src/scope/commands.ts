import { Command, Editor, Notice } from "obsidian";
import TextGeneratorPlugin from "../main";
import { TemplatesModal } from "../models/model";

import { PackageManagerUI } from "#/scope/package-manager/package-manager-ui";
import ContentManagerCls from "#/scope/content-manager";

import { SetMaxTokens } from "#/ui/settings/components/set-max-tokens";
import { TextExtractorTool } from "#/ui/text-extractor-tool";
import { SetLLM } from "#/ui/settings/components/set-llm";
import { VIEW_Playground_ID } from "#/ui/playground";
import { VIEW_TOOL_ID } from "#/ui/tool";

import debug from "debug";
import { SetModel } from "#/ui/settings/components/set-model";
const logger = debug("textgenerator:main");

export default class Commands {
  plugin: TextGeneratorPlugin;

  static commands: Command[] = [
    {
      id: "generate-text",
      name: "Generate Text!",
      icon: "GENERATE_ICON",
      hotkeys: [{ modifiers: ["Mod"], key: "j" }],
      async callback() {
        const self: Commands = this as any;
        try {
          if (self.plugin.processing)
            return self.plugin.textGenerator.signalController?.abort();
          const activeView = await self.plugin.getActiveView();
          const CM = ContentManagerCls.compile(activeView, self.plugin);
          await self.plugin.textGenerator.generateInEditor({}, false, CM);
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "generate-text-with-metadata",
      name: "Generate Text (use Metadata))!",
      icon: "GENERATE_META_ICON",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "j" }],
      async callback() {
        const self: Commands = this as any;
        try {
          const activeView = await self.plugin.getActiveView();
          const CM = ContentManagerCls.compile(activeView, self.plugin);
          await self.plugin.textGenerator.generateInEditor({}, true, CM);
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "insert-generated-text-From-template",
      name: "Templates: Generate & Insert",
      icon: "circle",
      //hotkeys: [{ modifiers: ["Mod"], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              if (!result.path) throw "Nothing was selected";

              const self: Commands = this as any;
              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.generateFromTemplate({
                  params: {},
                  templatePath: result.path,
                  filePath: (await CM.getActiveFile())?.path,
                  insertMetadata: true,
                  editor: CM,
                  activeFile: true,
                });
              } catch (error) {
                self.plugin.handelError(error);
              }
            },
            "Generate and Insert Template In The Active Note"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "generated-text-to-clipboard-From-template",
      name: "Templates: Generate & Copy To Clipboard ",
      icon: "circle",
      //hotkeys: [{ modifiers: ["Mod"], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.generateToClipboard(
                  {},
                  result.path || "",
                  true,
                  CM
                );
              } catch (error: any) {
                self.plugin.handelError(error);
              }
            },
            "Generate & Copy To Clipboard"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "create-generated-text-From-template",
      name: "Templates: Generate & Create Note",
      icon: "plus-circle",
      //hotkeys: [{ modifiers: ["Mod","Shift"], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              if (!result.path) throw "Nothing was selected";

              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.generateFromTemplate({
                  params: {},
                  templatePath: result.path,
                  filePath: (await CM.getActiveFile())?.path,
                  insertMetadata: true,
                  editor: CM,
                  activeFile: false,
                });
              } catch (error: any) {
                self.plugin.handelError(error);
              }
            },
            "Generate and Create a New Note From Template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "search-results-batch-generate-from-template",
      name: "Templates (Batch): From Search Results",
      icon: "plus-circle",
      //hotkeys: [{ modifiers: ["Mod","Shift"], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              if (!result.path) throw "Nothing was selected";
              const files =
                await self.plugin.textGenerator.embeddingsScope.getSearchResults();

              if (!files.length)
                return self.plugin.handelError(
                  "You need at least one search result"
                );

              await self.plugin.textGenerator.generateBatchFromTemplate(
                files,
                {},
                result.path,
                true
              );
            },
            "Generate and create multiple notes from template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "insert-text-From-template",
      name: "Templates: Insert Template",
      icon: "square",
      //hotkeys: [{ modifiers: ['Alt'], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              if (!result.path) throw "Nothing was selected";

              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.generateFromTemplate({
                  params: {},
                  templatePath: result.path,
                  filePath: (await CM.getActiveFile())?.path,
                  insertMetadata: true,
                  editor: CM,
                  activeFile: true,
                });
              } catch (error: any) {
                self.plugin.handelError(error);
              }
            },
            "Insert Template In The Active Note"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "create-text-From-template",
      name: "Templates: Insert & Create Note",
      icon: "plus-square",
      //hotkeys: [{ modifiers: ["Shift","Alt"], key: "q"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              if (!result.path) throw "Nothing was selected";

              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.generateFromTemplate({
                  params: {},
                  templatePath: result.path,
                  filePath: (await CM.getActiveFile())?.path,
                  insertMetadata: true,
                  editor: CM,
                  activeFile: false,
                  insertMode: true,
                });
              } catch (error) {
                self.plugin.handelError(error);
              }
            },
            "Create a New Note From Template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "show-modal-From-template",
      name: "Show modal From Template",
      icon: "layout",
      //hotkeys: [{ modifiers: ["Alt"], key: "4"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                await self.plugin.textGenerator.tempalteToModal({
                  params: {},
                  templatePath: result.path,
                  editor: CM,
                  filePath: (await CM.getActiveFile())?.path,
                });
              } catch (error) {
                self.plugin.handelError(error);
              }
            },
            "Choose a template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "open-template-as-tool",
      name: "Open Template as Tool",
      icon: "layout",
      //hotkeys: [{ modifiers: ["Alt"], key: "4"}],
      async callback() {
        const self: Commands = this as any;
        try {
          const activeView = await self.plugin.getActiveView();
          const CM = ContentManagerCls.compile(activeView, self.plugin);
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              self.plugin.activateView(VIEW_TOOL_ID, {
                templatePath: result.path,
                title: result.name,
                editor: CM,
                openInPopout: true,
              });
            },
            "Choose a template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "open-playground",
      name: "Open Template Playground",
      icon: "layout",
      //hotkeys: [{ modifiers: ["Alt"], key: "4"}],
      async callback() {
        const self: Commands = this as any;
        try {
          self.plugin.activateView(VIEW_Playground_ID, {
            editor: self.plugin.app.workspace.activeEditor?.editor,
            openInPopout: false,
          });
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },
    {
      id: "set_max_tokens",
      name: "Set max_tokens",
      icon: "separator-horizontal",
      //hotkeys: [{ modifiers: ["Alt"], key: "1" }],
      async callback() {
        const self: Commands = this as any;
        new SetMaxTokens(
          self.plugin.app,
          self.plugin,
          self.plugin.settings.max_tokens.toString(),
          async (result: string) => {
            self.plugin.settings.max_tokens = parseInt(result);
            await self.plugin.saveSettings();
            new Notice(`Set Max Tokens to ${result}!`);
            self.plugin.updateStatusBar("");
          }
        ).open();
      },
    },

    {
      id: "set-llm",
      name: "Choose a LLM",
      icon: "list-start",
      //hotkeys: [{ modifiers: ["Alt"], key: "2" }],
      async callback() {
        const self: Commands = this as any;
        try {
          new SetLLM(
            self.plugin.app,
            self.plugin,
            async (selectedLLMName) => {
              console.log(selectedLLMName);
              if (!selectedLLMName) return;

              const llm =
                self.plugin.textGenerator.LLMRegestry.get(selectedLLMName);
              if (llm) {
                self.plugin.settings.selectedProvider = selectedLLMName as any;
              }

              self.plugin.textGenerator.load();
              await self.plugin.saveSettings();
            },
            "Choose a LLM"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "set-model",
      name: "Choose a Model",
      icon: "list-start",
      //hotkeys: [{ modifiers: ["Alt"], key: "2" }],
      async callback() {
        const self: Commands = this as any;
        try {
          new SetModel(
            self.plugin.app,
            self.plugin,
            async (selectedModel) => {
              console.log(selectedModel);
              const provider = self.plugin.settings.selectedProvider as string;
              if (
                !provider ||
                !self.plugin.settings.LLMProviderOptions[provider]
              )
                return;

              self.plugin.settings.LLMProviderOptions[provider].model =
                selectedModel;
              await self.plugin.saveSettings();
            },
            "Choose a LLM"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "packageManager",
      name: "Template Packages Manager",
      icon: "boxes",
      //hotkeys: [{ modifiers: ["Alt"], key: "3" }],
      async callback() {
        const self: Commands = this as any;
        new PackageManagerUI(
          self.plugin.app,
          self.plugin,
          async (result: string) => {}
        ).open();
      },
    },

    {
      id: "create-template",
      name: "Create a Template",
      icon: "plus",
      //hotkeys: [{ modifiers: ["Alt"], key: "c"}],
      async callback() {
        const self: Commands = this as any;

        try {
          const activeView = await self.plugin.getActiveView();
          const CM = ContentManagerCls.compile(activeView, self.plugin);

          await self.plugin.textGenerator.createTemplateFromEditor(CM);
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "get-title",
      name: "Generate a Title",
      icon: "heading",
      //hotkeys: [{ modifiers: ["Alt"], key: "c"}],
      async callback() {
        const self: Commands = this as any;

        try {
          const CM = ContentManagerCls.compile(
            await self.plugin.getActiveView(),
            self.plugin
          );
          const file = await CM.getActiveFile();

          let prompt = ``;

          let templateContent =
            self.plugin.defaultSettings.advancedOptions?.generateTitleInstruct;

          try {
            if (
              self.plugin.settings.advancedOptions?.generateTitleInstructEnabled
            ) {
              templateContent =
                self.plugin.settings.advancedOptions?.generateTitleInstruct ||
                self.plugin.defaultSettings.advancedOptions
                  ?.generateTitleInstruct;
            }

            const templateContext =
              await self.plugin.contextManager.getTemplateContext({
                editor: ContentManagerCls.compile(
                  await self.plugin.getActiveView(),
                  self.plugin,
                  {
                    templateContent,
                  }
                ),
                templateContent,
                filePath: file?.path,
              });

            templateContext.content = (await CM.getValue()).trim();

            const splittedTemplate = self.plugin.contextManager.splitTemplate(
              templateContent || ""
            );

            prompt = await splittedTemplate.inputTemplate?.(templateContext);
          } catch (err: any) {
            logger(err);
          }

          const generatedTitle = await self.plugin.textGenerator.gen(
            prompt,
            {}
          );

          const sanitizedTitle = generatedTitle
            .trim()
            .replaceAll("\\", "")
            .replace(/[*\\"/<>:|?\.]/g, "")
            .replace(/^\n*/g, "");

          if (!file) return logger(`No active file was detected`);

          const renamedFilePath = file.path.replace(
            file.name,
            `${sanitizedTitle}.${file.extension}`
          );

          await self.plugin.app.fileManager.renameFile(file, renamedFilePath);

          logger(`Generated a title: ${sanitizedTitle}`);
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "auto-suggest",
      name: "Turn on or off the auto suggestion",
      icon: "heading",
      //hotkeys: [{ modifiers: ["Alt"], key: "c"}],
      async editorCallback(editor: Editor) {
        const self: Commands = this as any;
        self.plugin.settings.autoSuggestOptions.isEnabled =
          !self.plugin.settings.autoSuggestOptions.isEnabled;
        await self.plugin.saveSettings();

        self.plugin.autoSuggest?.renderStatusBar();

        if (self.plugin.settings.autoSuggestOptions.isEnabled) {
          new Notice(`Auto Suggestion is on!`);
        } else {
          new Notice(`Auto Suggestion is off!`);
        }
      },
    },

    {
      id: "calculate-tokens",
      name: "Estimate tokens for the current document",
      icon: "heading",
      //hotkeys: [{ modifiers: ["Alt"], key: "c"}],
      async callback() {
        const self: Commands = this as any;

        try {
          const activeView = await self.plugin.getActiveView();
          const CM = ContentManagerCls.compile(activeView, self.plugin);

          const context = await self.plugin.contextManager.getContext({
            editor: CM,
            filePath: (await CM.getActiveFile())?.path,
            insertMetadata: true,
            addtionalOpts: {
              estimatingMode: true,
            },
          });
          self.plugin.tokensScope.showTokens(
            await self.plugin.tokensScope.estimate(context)
          );
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "calculate-tokens-for-template",
      name: "Estimate tokens for a Template",
      icon: "layout",
      //hotkeys: [{ modifiers: ["Alt"], key: "4"}],
      async callback() {
        const self: Commands = this as any;
        try {
          new TemplatesModal(
            self.plugin.app,
            self.plugin,
            async (result) => {
              try {
                const activeView = await self.plugin.getActiveView();
                const CM = ContentManagerCls.compile(activeView, self.plugin, {
                  templatePath: result.path,
                });

                const context = await self.plugin.contextManager.getContext({
                  editor: CM,
                  filePath: (await CM.getActiveFile())?.path,
                  insertMetadata: true,
                  templatePath: result.path,
                  addtionalOpts: {
                    estimatingMode: true,
                  },
                });

                self.plugin.tokensScope.showTokens(
                  await self.plugin.tokensScope.estimate(context)
                );
              } catch (error) {
                self.plugin.handelError(error);
              }
            },
            "Choose a template"
          ).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "text-extractor-tool",
      name: "Text Extractor Tool",
      icon: "layout",
      async callback() {
        const self: Commands = this as any;
        try {
          new TextExtractorTool(self.plugin.app, self.plugin).open();
        } catch (error) {
          self.plugin.handelError(error);
        }
      },
    },

    {
      id: "stop-stream",
      name: "Stop Stream",
      icon: "layout",
      async callback() {
        const self: Commands = this as any;
        if (!self.plugin.textGenerator.signalController?.signal.aborted) {
          self.plugin.textGenerator.endLoading();
        }
      },
    },
    {
      id: "reload",
      name: "reload Plugin",
      icon: "layout",
      async callback() {
        const self: Commands = this as any;

        self.plugin.reload();
      },
    },
  ];

  commands: Command[] = Commands.commands.map((cmd) => ({
    ...cmd,
    editorCallback: cmd.editorCallback?.bind(this),
    callback: cmd.callback?.bind(this),
  }));

  constructor(plugin: TextGeneratorPlugin) {
    this.plugin = plugin;
  }

  async addCommands() {
    // call the function before testing for onload document, just to make sure it is getting called event tho the document is already loaded
    const cmds = this.commands.filter(
      (cmd) =>
        this.plugin.settings.options[
          cmd.id as keyof typeof this.plugin.settings.options
        ] === true
    );

    const templates = await this.plugin.textGenerator.updateTemplatesCache();

    const templatesWithCommands = templates.filter((t) => t?.commands);
    logger("Templates with commands ", { templatesWithCommands });

    templatesWithCommands.forEach((template) => {
      //
      template.commands?.forEach((command) => {
        logger("Template commands ", { template, command });
        const cmd: Command = {
          id: `${template.path.split("/").slice(-2, -1)[0]}-${command}-${
            template.id
          }`,
          name: `${template.id || template.name}: ${command.toUpperCase()}`,
          callback: async () => {
            const self: Commands = this as any;

            const activeView = await self.plugin.getActiveView();

            const CM = ContentManagerCls.compile(activeView, self.plugin, {
              templatePath: template.path,
            });

            const filePath = (await CM.getActiveFile())?.path;
            try {
              switch (command) {
                case "generate":
                  await self.plugin.textGenerator.generateFromTemplate({
                    params: {},
                    templatePath: template.path,
                    insertMetadata: true,
                    editor: CM,
                    activeFile: true,
                  });
                  break;
                case "insert":
                  await self.plugin.textGenerator.generateFromTemplate({
                    params: {},
                    templatePath: template.path,
                    insertMetadata: true,
                    editor: CM,
                    activeFile: true,
                    insertMode: true,
                  });
                  break;
                case "generate&create":
                  await self.plugin.textGenerator.generateFromTemplate({
                    params: {},
                    templatePath: template.path,
                    insertMetadata: true,
                    editor: CM,
                    activeFile: false,
                  });
                  break;
                case "insert&create":
                  await self.plugin.textGenerator.generateFromTemplate({
                    params: {},
                    templatePath: template.path,
                    insertMetadata: true,
                    editor: CM,
                    activeFile: false,
                    insertMode: true,
                  });
                  break;
                case "modal":
                  await self.plugin.textGenerator.tempalteToModal({
                    params: {},
                    templatePath: template.path,
                    editor: CM,
                    filePath,
                  });
                  break;
                case "clipboard":
                  await self.plugin.textGenerator.generateToClipboard(
                    {},
                    template.path,
                    true,
                    CM
                  );
                  break;
                case "estimate":
                  {
                    const context = await self.plugin.contextManager.getContext(
                      {
                        editor: CM,
                        filePath,
                        insertMetadata: true,
                        templatePath: template.path,
                        addtionalOpts: {
                          estimatingMode: true,
                        },
                      }
                    );
                    self.plugin.tokensScope.showTokens(
                      await self.plugin.tokensScope.estimate(context)
                    );
                  }
                  break;
                case "tool":
                  self.plugin.activateView(VIEW_TOOL_ID, {
                    templatePath: template.path,
                    title: template.id || template.name,
                    openInPopout: true,
                    editor: CM,
                  });
                  break;

                default:
                  console.error(
                    "command does not work outside of an editor",
                    command
                  );
                  break;
              }
            } catch (error) {
              self.plugin.handelError(error);
            }
          },
        };
        logger("command ", { cmd, template });
        cmds.push(cmd);
      });
    });

    cmds.forEach(async (command) => {
      this.plugin.addCommand({
        ...command,
        editorCallback: command.editorCallback?.bind(this),
        callback: command.callback?.bind(this),
      });
    });
  }
}
