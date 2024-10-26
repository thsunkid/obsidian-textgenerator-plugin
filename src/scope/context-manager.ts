import {
  App,
  Notice,
  Component,
  TFile,
  HeadingCache,
  CachedMetadata,
} from "obsidian";
import { AsyncReturnType, Context, Message } from "../types";
import TextGeneratorPlugin from "../main";
import { IGNORE_IN_YAML } from "../constants";

import {
  escapeRegExp,
  getContextAsString,
  removeYAML,
  replaceScriptBlocksWithMustachBlocks,
  walkUntilTrigger,
} from "../utils";
import debug from "debug";
const logger = debug("textgenerator:ContextManager");
import Helpersfn, { Handlebars } from "../helpers/handlebars-helpers";
import {
  ContentExtractor,
  ExtractorSlug,
  UnExtractorSlug,
  getExtractorMethods,
} from "../extractors/content-extractor";
import { getAPI as getDataviewApi } from "obsidian-dataview";
import set from "lodash.set";
import merge from "lodash.merge";
import { getHBValues } from "../utils/barhandles";

import JSON5 from "json5";
import type { ContentManager } from "./content-manager/types";
import { convertArrayBufferToBase64Link } from "#/LLMProviders/utils";

import mime from "mime-types";
import { InputOptions } from "#/lib/models";

interface CodeBlock {
  type: string;
  content: string;
  full: string;
}

type CodeBlockProcessor = (block: CodeBlock) => Promise<string>;

export interface ContextTemplate {
  inputTemplate: HandlebarsTemplateDelegate<any>;
  outputTemplate: HandlebarsTemplateDelegate<any>;
}

export interface InputContext {
  template?: ContextTemplate;
  templatePath?: string;
  options?: AvailableContext;
  context?: string;
}

export interface AvailableContext {
  title?: string;
  starredBlocks?: any;
  tg_selection?: string;
  selections?: string[];
  selection?: string;
  previousWord?: string;
  nextWord?: string;
  afterCursor?: string;
  beforeCursor?: string;
  inverseSelection?: string;
  cursorParagraph?: string;
  cursorSentence?: string;
  frontmatter?: Record<string, any>;
  yaml?: Record<string, any>;
  metadata?: string;
  content?: string;
  contentWithRef?: string;
  instructionAddtlContext?: string;
  headings?: AsyncReturnType<
    InstanceType<typeof ContextManager>["getHeadingContent"]
  >;
  children?: AsyncReturnType<
    InstanceType<typeof ContextManager>["getChildrenContent"]
  >;
  highlights?: AsyncReturnType<
    InstanceType<typeof ContextManager>["getHighlights"]
  >;
  mentions?: AsyncReturnType<
    InstanceType<typeof ContextManager>["getMentions"]
  >;
  extractions?: AsyncReturnType<
    InstanceType<typeof ContextManager>["getExtractions"]
  >;

  keys: ReturnType<InstanceType<typeof TextGeneratorPlugin>["getApiKeys"]>;
  _variables: Record<string, true>;

  noteFile?: TFile;
  templatePath?: string;
  debugMode?: boolean;
  viewPreviewTime?: number;
}

interface TableRow {
  [key: string]: string;
}
interface ExtendedChildFile extends TFile {
  content: string;
  title: string;
  position: {
    start: {
      line: number;
      col: number;
      offset: number;
    };
    end: {
      line: number;
      col: number;
      offset: number;
    };
  };
  isEmbeddedBlock: boolean;
  isMentionedDoc: boolean;
  frontmatter: any;
  headings: HeadingCache[] | undefined;
}

export default class ContextManager {
  plugin: TextGeneratorPlugin;
  app: App;

  constructor(app: App, plugin: TextGeneratorPlugin) {
    logger("ContextManager constructor");
    this.app = app;
    this.plugin = plugin;

    const Helpers = Helpersfn(this);

    Object.keys(Helpers).forEach((key) => {
      Handlebars.registerHelper(key, Helpers[key as keyof typeof Helpers]);
    });
  }

  async getContext(props: {
    editor?: ContentManager;
    filePath?: string;
    insertMetadata?: boolean;
    templatePath?: string;
    templateContent?: string;
    addtionalOpts?: any;
  }): Promise<InputContext> {
    const templatePath = props.templatePath || "";
    const templateContent = props.templateContent || "";

    logger(
      "getContext",
      props.insertMetadata,
      props.templatePath,
      templateContent,
      props.addtionalOpts
    );

    /* Template */
    if (templatePath.length || templateContent?.length) {
      const options = merge(
        {},
        await this.getTemplateContext({
          editor: props.editor,
          templatePath,
          templateContent,
          filePath: props.filePath,
        }),
        props.addtionalOpts
      );

      if (!templatePath.length) {
        logger(
          "/!\\ Context Template not from path.",
          "There is no context output from here. Only using with playground.",
          options
        );
        return {
          options,
          templatePath: "",
        };
      }

      const { context, inputTemplate, outputTemplate } =
        await this.templateFromPath(templatePath, options, templateContent);

      logger("Context Template", { context, options });

      return {
        context,
        options,
        template: { inputTemplate, outputTemplate: outputTemplate as any },
        templatePath: props.templatePath,
      };
    } else {
      /* Without template */

      const contextTemplate = this.plugin.settings.context.customInstructEnabled
        ? this.plugin.settings.context.customInstruct ||
          this.plugin.defaultSettings.context.customInstruct
        : "{{tg_selection}}";

      const options = await this.getDefaultContext(
        props.editor,
        undefined,
        contextTemplate
      );

      logger("getContext.options", options);
      // take context
      let context = await getContextAsString(options as any, contextTemplate);

      if (props.insertMetadata) {
        const frontmatter = this.getMetaData()?.frontmatter; // frontmatter of the active document

        if (
          typeof frontmatter !== "undefined" &&
          Object.keys(frontmatter).length !== 0
        ) {
          /* Text Generate with metadata */
          options["frontmatter"] = frontmatter;
          context = this.getMetaDataAsStr(frontmatter) + context;
        } else {
          new Notice("No valid Metadata (YAML front matter) found!");
        }
      }

      logger("Context without template", { context, options });
      return { context, options };
    }
  }

  async getContextFromFiles(
    files: TFile[],
    templatePath = "",
    addtionalOpts: any = {}
  ) {
    const contexts: (InputContext | undefined)[] = [];

    for (const file of files) {
      const fileMeta = this.getMetaData(file.path); // active document

      const options = merge(
        {},
        this.getFrontmatter(this.getMetaData(templatePath)),
        this.getFrontmatter(fileMeta),
        addtionalOpts,
        {
          tg_selection: removeYAML(
            await this.plugin.app.vault.cachedRead(file)
          ),
        }
      );

      const { context, inputTemplate, outputTemplate } =
        await this.templateFromPath(templatePath, options);

      logger("Context Template", { context, options });

      contexts.push({
        context,
        options,
        template: { inputTemplate, outputTemplate },
        templatePath,
      } as InputContext);

      //   app.workspace.openLinkText("", filePath, true);
      //   contexts.push(
      //     app.workspace.activeEditor?.editor
      //       ? await this.getContext(
      //           app.workspace.activeEditor?.editor,
      //           insertMetadata,
      //           templatePath,
      //           {
      //             ...addtionalOpts,
      //             selection: app.workspace.activeEditor.editor.getValue(),
      //           }
      //         )
      //       : undefined
      //   );

      //   console.log({ contexts });
      //   app.workspace.getLeaf().detach();
    }

    return contexts;
  }

  // DEPRICATED
  // extractVariablesFromTemplate(templateContent: string): string[] {
  //   const ast: hbs.AST.Program =
  //     Handlebars.parseWithoutProcessing(templateContent);

  //   const extractVariablesFromBody = (
  //     body: hbs.AST.Statement[],
  //     eachContext: string | null = null
  //   ): string[] => {
  //     return body
  //       .flatMap((statement: hbs.AST.Statement) => {
  //         if (statement.type === "MustacheStatement") {
  //           const moustacheStatement: hbs.AST.MustacheStatement =
  //             statement as hbs.AST.MustacheStatement;
  //           const paramsExpressionList =
  //             moustacheStatement.params as hbs.AST.PathExpression[];
  //           const pathExpression =
  //             moustacheStatement.path as hbs.AST.PathExpression;
  //           const fullPath = eachContext
  //             ? `${eachContext}.${pathExpression.original}`
  //             : pathExpression.original;

  //           return paramsExpressionList[0]?.original || fullPath;
  //         } else if (
  //           statement.type === "BlockStatement" &&
  //           // @ts-ignore
  //           statement.path.original === "each"
  //         ) {
  //           const blockStatement: hbs.AST.BlockStatement =
  //             statement as hbs.AST.BlockStatement;
  //           const eachVariable = blockStatement.path.original;
  //           // @ts-ignore
  //           const eachContext = blockStatement.params[0]?.original;

  //           return extractVariablesFromBody(
  //             blockStatement.program.body,
  //             eachContext
  //           );
  //         } else {
  //           return [];
  //         }
  //       })
  //       .filter((value, index, self) => self.indexOf(value) === index);
  //   };

  //   const handlebarsVariables = extractVariablesFromBody(ast.body);
  //   return handlebarsVariables;
  // }

  async getTemplateContext(props: {
    editor?: ContentManager;
    filePath?: string;
    templatePath?: string;
    templateContent?: string;
  }): Promise<AvailableContext> {
    const templatePath = props.templatePath || "";
    logger("getTemplateContext", props.editor, props.templatePath);

    const contextOptions: Context = this.plugin.settings.context;

    let templateContent = props.templateContent || "";

    if (templatePath.length > 0) {
      const templateFile =
        await this.app.vault.getAbstractFileByPath(templatePath);
      if (templateFile) {
        templateContent = await this.app.vault.read(templateFile as TFile);
      }
    }

    const contextTemplate =
      this.plugin.settings.context.contextTemplate ||
      this.plugin.defaultSettings.context.contextTemplate;

    logger(
      "getTemplateContext.contextTemplate",
      this.plugin.settings.context.contextTemplate,
      this.plugin.defaultSettings.context.contextTemplate
    );

    const contextObj = await this.getDefaultContext(
      props.editor,
      undefined,
      contextTemplate + templateContent,
      templatePath
    );

    const context = contextObj._variables["context"]
      ? await getContextAsString(contextObj as any, contextTemplate)
      : "";

    const { selection, selections, content, headings } = contextObj;

    const blocks = {
      ...contextObj,
      frontmatter: merge(
        {},
        this.getFrontmatter(this.getMetaData(templatePath)),
        contextObj.frontmatter
      ),
      headings,
    };

    if (contextOptions.includeClipboard) {
      try {
        blocks.clipboard = await this.getClipboard();
      } catch {
        // Clipboard access failed, ignore
      }
    }

    const options = {
      selection,
      selections,
      ...blocks.frontmatter,
      ...blocks.headings,
      content,
      context,
      ...blocks,
    };

    logger("getTemplateContext Context Variables", options);
    return options;
  }

  templateContains(variables: string[], searchVariable: string) {
    return variables.some((variable) => variable.includes(searchVariable));
  }

  async getDefaultContext(
    editor?: ContentManager,
    filePath?: string,
    contextTemplate?: string,
    templatePath?: string
  ): Promise<AvailableContext> {
    logger("contextTemplate", contextTemplate);

    const context: AvailableContext = {
      keys: {},
      _variables: {},
    };

    const vars =
      this.getHBVariablesObjectOfTemplate(contextTemplate || "") || {};
    context["_variables"] = vars;

    const activeFile = this.getActiveFile();
    context.noteFile = activeFile || undefined;

    const title =
      vars["title"] || vars["mentions"]
        ? (filePath
            ? this.app.vault.getAbstractFileByPath(filePath)?.name ||
              activeFile?.basename
            : activeFile?.basename) || ""
        : "";

    const activeDocCache = this.getMetaData(filePath || "");

    if (editor) {
      //   context["line"] = this.getConsideredContext(editor);
      context["tg_selection"] = await this.getTGSelection(editor);

      const selections = await this.getSelections(editor);
      const selection = await this.getSelection(editor);

      context["selections"] =
        selection && selections.length == 0 ? [selection] : selections || [];

      context["selection"] = selection || "";

      context["title"] = title;

      context["frontmatter"] = this.getFrontmatter(activeDocCache) || "";

      if (vars["previousWord"])
        context["previousWord"] = await this.getPreviousWord(editor);

      if (vars["nextWord"])
        context["nextWord"] = await this.getNextWord(editor);

      if (vars["beforeCursor"])
        context["beforeCursor"] = await this.getBeforeCursor(editor);

      if (vars["afterCursor"])
        context["afterCursor"] = await this.getAfterCursor(editor);

      if (vars["inverseSelection"])
        context["inverseSelection"] = await this.getInverseSelection(editor);

      if (vars["cursorParagraph"])
        context["cursorParagraph"] = await this.getCursorParagraph(editor);

      if (vars["cursorSentence"])
        context["cursorSentence"] = await this.getCursorSentence(editor);

      if (vars["content"]) context["content"] = await editor.getValue();

      if (vars["instructionAddtlContext"] && templatePath) {
        const frontmatter = this.getFrontmatter(this.getMetaData(templatePath));
        if (!frontmatter.instructionFilePath)
          throw new Error("No instructionFilePath in frontmatter");
        const instructionFilePath = frontmatter.instructionFilePath; // ;
        const formattedInstructionContent =
          await this.compileInstruction(instructionFilePath);
        context["instructionAddtlContext"] = formattedInstructionContent;
      }

      if (vars["contentWithRef"]) {
        const originalContent = await editor.getValue();

        const formattedContentWithRef = await this.replaceLinksWithContent(
          originalContent,
          activeDocCache,
          true,
          true
        );
        const metadataSeparatorString = "\n\n---";
        // Remove the metadata starting from the first separator string
        const formattedContentWithRefWithoutMetadata =
          formattedContentWithRef.includes(metadataSeparatorString)
            ? formattedContentWithRef
                .split(metadataSeparatorString)
                .slice(1)
                .join(metadataSeparatorString)
            : formattedContentWithRef;

        context["contentWithRef"] = formattedContentWithRefWithoutMetadata;
      }

      if (vars["highlights"])
        context["highlights"] = editor ? await this.getHighlights(editor) : [];
    }

    if (vars["starredBlocks"])
      context["starredBlocks"] =
        (await this.getStarredBlocks(filePath || "")) || "";

    if (vars["yaml"])
      context["yaml"] = this.clearFrontMatterFromIgnored(
        this.getFrontmatter(activeDocCache) || ""
      );

    if (vars["metadata"])
      context["metadata"] =
        this.getMetaDataAsStr(context["frontmatter"] || {}) || "";

    if (vars["keys"]) context["keys"] = this.plugin.getApiKeys();

    if (activeDocCache)
      context["headings"] = await this.getHeadingContent(activeDocCache);

    if (vars["children"] && activeDocCache)
      context["children"] = await this.getChildrenContent(activeDocCache, vars);

    if (vars["mentions"] && title)
      context["mentions"] = await this.getMentions(title);

    if (vars["extractions"])
      context["extractions"] = await this.getExtractions(filePath, editor);

    // // execute dataview
    const _dVCache: any = {};
    for (const key in context)
      if (!["frontmatter", "title", "yaml"].includes(key))
        context[key as keyof typeof context] = await this.execDataview(
          context[key as keyof typeof context],
          _dVCache
        );

    return context;
  }

  async splitContent(
    markdownText: string,
    source?: TFile,
    options?: InputOptions
  ): Promise<Message["content"]> {
    if (!source) return markdownText;
    const metadata = this.app.metadataCache.getFileCache(source);
    if (!metadata?.embeds) return markdownText;

    const elements: Message["content"] = [];

    // splitting
    let lastIndex = 0;

    // Sort the embeds by the length of the original text in descending order to prevent substring conflicts
    metadata.embeds.sort((a, b) => b.original.length - a.original.length);

    // Create a function to escape regex special characters in strings
    const escapeRegex = (string: string) =>
      string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

    // Replace each embed in the markdown text
    metadata.embeds.forEach((embed) => {
      const regex = new RegExp(escapeRegex(embed.original), "g");

      markdownText.replace(regex, (match, index) => {
        // Add text segment before the embed if there is any
        const content = markdownText.substring(lastIndex, index);
        if (index > lastIndex) {
          elements.push({ type: "text", text: content.trim() ? content : "_" });
        }

        // Add embed segment
        elements.push({
          type: "image_url",
          image_url: {
            url: embed.link,
          },
        });

        lastIndex = index + match.length;

        return match;
      });
    });

    // Add remaining text after the last embed
    if (lastIndex < markdownText.length) {
      elements.push({ type: "text", text: markdownText.substring(lastIndex) });
    }

    // making base64 for
    for (let i = 0; i < elements.length; i++) {
      // @ts-ignore
      if (
        elements[i].type == "image_url" &&
        elements[i].image_url?.url &&
        !elements[i].image_url.url.startsWith("http")
      ) {
        // @ts-ignore
        const path = elements[i].image_url?.url;
        // @ts-ignore
        const attachmentFolderPath: string = this.app.vault.getConfig?.(
          "attachmentFolderPath"
        ); // it works to getConfig in obsidian v1.6.5

        let tfile = await this.app.vault.getFileByPath(path);
        if (!tfile) {
          // try to find in attachment folder, base user's preferences
          tfile = await this.app.vault.getFileByPath(
            attachmentFolderPath + "/" + path
          );
          if (!tfile) continue;
        }

        const mimtype = mime.lookup(tfile.extension) || "";

        const buff = convertArrayBufferToBase64Link(
          await this.app.vault.readBinary(tfile as any),
          mimtype
        );

        if (
          (options?.images && mimtype.startsWith("image")) ||
          (options?.audio && mimtype.startsWith("audio")) ||
          (options?.videos && mimtype.startsWith("video"))
        ) {
          // @ts-ignore
          elements[i].image_url.url = buff;
        } else {
          elements[i] = {
            type: "text",
            // @ts-ignore
            text: elements[i].image_url.url,
          };
        }
      }
    }

    return elements;
  }

  overProcessTemplate(templateContent: string) {
    // ignore all scripts content
    // replace all script helpers with script mustache blocks
    templateContent = replaceScriptBlocksWithMustachBlocks(templateContent);

    return templateContent;
  }

  /** Editor variable is for passing it to the next templates that are being called from the handlebars */
  splitTemplate(templateContent: string) {
    logger("splitTemplate", templateContent);
    templateContent = removeYAML(templateContent);

    // @NOTE: THIS SHIT IS COMPLICATED AF.
    // The inputTemplate is used to generate the input for the text generation model,
    // possibly include the script (see `replaceScriptBlocksWithMustachBlocks`) or dynamic content.
    let inputContent, outputContent, preRunnerContent;
    if (templateContent.includes("***")) {
      const splitContent = templateContent
        // @ts-ignore
        .replaceAll("\\***", "")
        .split("\n***");
      inputContent = this.overProcessTemplate(
        splitContent[splitContent.length == 3 ? 1 : 0]
      );
      outputContent = this.overProcessTemplate(
        splitContent[splitContent.length == 3 ? 2 : 1]
      ).slice(1);

      preRunnerContent = this.overProcessTemplate(
        splitContent[splitContent.length - 3]
      );
    } else {
      inputContent = this.overProcessTemplate(templateContent);
      outputContent = this.overProcessTemplate("");
    }

    // The handlebarsMiddleware function is a wrapper around a Handlebars template delegate (result of Handlebars.compile(inputContent))
    // Its main purpose is to add an extra layer of processing (blocks, dataview, dataviewjs) after the initial Handlebars template compilation and execution.
    const inputTemplate = this.handlebarsMiddleware(
      Handlebars.compile(inputContent, {
        noEscape: true,
      })
    );

    const preRunnerTemplate = preRunnerContent
      ? this.handlebarsMiddleware(
          Handlebars.compile(preRunnerContent, {
            noEscape: true,
          })
        )
      : null;

    const outputTemplate = outputContent
      ? this.handlebarsMiddleware(
          Handlebars.compile(outputContent, {
            noEscape: true,
          })
        )
      : null;

    return {
      preRunnerTemplate,
      inputContent,
      outputContent,
      preRunnerContent,
      inputTemplate,
      outputTemplate,
    };
  }

  clearFrontMatterFromIgnored(yml: Record<string, any>) {
    const objNew: Record<string, any> = {};

    for (const key in yml) {
      if (
        Object.prototype.hasOwnProperty.call(yml, key) &&
        !IGNORE_IN_YAML[key]
      ) {
        objNew[key] = yml[key];
      }
    }
    return objNew;
  }

  async templateFromPath(
    templatePath: string,
    options: any,
    _templateContent?: string
  ) {
    logger("templateFromPath", templatePath, options);
    const templateFile =
      await this.app.vault.getAbstractFileByPath(templatePath);

    if (!templateFile) throw `Template ${templatePath} couldn't be found`;

    const templateContent =
      _templateContent || (await this.app.vault.read(templateFile as TFile));

    const templates = this.splitTemplate(templateContent);

    if (templates.preRunnerTemplate) {
      // run prerunning script
      const n = new Notice("processing Initialization...", 300000);
      try {
        await templates.preRunnerTemplate(options);
      } catch (err: any) {
        n.hide();
        throw err;
      }
      n.hide();
    }

    const input = await templates.inputTemplate(options);

    logger("templateFromPath", { input });
    return { context: input, ...templates };
  }

  async getTemplateCustomInputConfig(templatePath: string) {
    const templateFile =
      await this.app.vault.getAbstractFileByPath(templatePath);

    const templateContent = await this.app.vault.read(templateFile as TFile);

    const templates = this.splitTemplate(templateContent);

    templates.preRunnerContent;

    // Define a regular expression to match JSON code blocks
    const jsonRegex = /```json:form([\s\S]+?)```/;

    // Match the JSON code block in the text
    const match = templates.preRunnerContent?.match(jsonRegex);

    // Check if a match is found
    if (match && match[1]) {
      // Extract and return the JSON code block
      const jsonCodeBlock = match[1].trim();
      try {
        return JSON5.parse(jsonCodeBlock);
      } catch (err: any) {
        new Notice(
          "JSON not parseable check console(CTRL+SHIFT+i) for more info"
        );
        this.plugin.handelError(err);
        return null;
      }
    } else {
      // Return null if no match is found
      return null;
    }
  }

  getSelections(editor: ContentManager) {
    const selections = editor.getSelections();
    return selections;
  }

  getTGSelection(editor: ContentManager) {
    return editor.getTgSelection(this.plugin.settings.tgSelectionLimiter);
  }

  async getSelection(editor: ContentManager) {
    let selectedText = await editor.getSelection();

    const frontmatter = this.getMetaData()?.frontmatter; // frontmatter of the active document
    if (
      typeof frontmatter !== "undefined" &&
      Object.keys(frontmatter).length !== 0
    ) {
      /* Text Generate with metadata */
      selectedText = removeYAML(selectedText).trim();
    }
    logger("getSelection", { selectedText });
    return selectedText;
  }

  getFrontmatter(fileCache: any) {
    return fileCache?.frontmatter;
  }

  async getHeadingContent(fileCache: any) {
    const headings = fileCache?.headings;
    const headingsContent: Record<string, string | undefined> = {};
    if (headings) {
      for (let i = 0; i < headings.length; i++) {
        let textBlock = await this.getTextBloc(headings[i].heading);
        textBlock = textBlock?.substring(
          textBlock.indexOf(headings[i].heading),
          textBlock.length
        );
        const reSafeHeading = escapeRegExp(headings[i].heading);
        const headingRegex = new RegExp(`${reSafeHeading}\\s*?\n`, "ig");
        textBlock = textBlock?.replace(headingRegex, "");
        headingsContent[headings[i].heading] = textBlock;
      }
    }
    return headingsContent;
  }

  async getChildrenContent(
    fileCache: {
      links?: {
        original: string;
        link: string;
      }[];
    },
    vars: any
  ) {
    // const contextOptions: Context = this.plugin.settings.context;
    const children: (TFile & {
      content: string;
      frontmatter: any;
      headings: HeadingCache[] | undefined;
    })[] = [];

    const links = fileCache?.links?.filter(
      (e) => e.original.substring(0, 2) === "[["
    );

    // remove duplicate links
    const uniqueLinks =
      links?.filter(
        (v, i, a) => a.findIndex((t) => t.original === v.original) === i
      ) || [];

    if (!uniqueLinks) return children;

    for (let i = 0; i < uniqueLinks.length; i++) {
      const link = uniqueLinks[i];

      if (!link.link) continue;

      const path = this.app.metadataCache.getFirstLinkpathDest(
        link.link,
        ""
      )?.path;

      if (!path) continue;

      const file = this.app.vault.getAbstractFileByPath(path);

      if (!file) continue;

      // load the file
      const content = await this.app.vault.read(file as any);

      const metadata = this.getMetaData(file.path);

      //TODO: only include frontmatter and headings if the option is set
      const blocks: any = {};

      blocks["frontmatter"] = metadata?.frontmatter;

      blocks["headings"] = metadata?.headings;

      const childInfo: any = {
        ...file,
        content,
        title: file.name.substring(0, file.name.length - 2),
        ...blocks,
      };

      children.push(childInfo);
    }
    return children;
  }

  async compileInstruction(instructionFilePath: string): Promise<string> {
    const startTime = performance.now();
    const instructionContent = await this.loadFileContent(instructionFilePath);
    if (!instructionContent)
      throw `Instruction file ${instructionFilePath} couldn't be found`;

    const instructionCache = await this.getMetaData(instructionFilePath);

    const contentWithEmbededBlocksContent = await this.replaceLinksWithContent(
      instructionContent,
      instructionCache,
      true,
      false
    );
    const contentWithRefTable = this.detectAndConvertTables(
      contentWithEmbededBlocksContent
    );
    const parseContent = async (
      content: string
    ): Promise<CachedMetadata | null> => {
      const tempFile = await this.createTempFile(content);
      // const fileMetadata = this.getMetaData(tempFile.path);
      const getCache = async (retries = 5) => {
        for (let i = 0; i < retries; i++) {
          const cache = this.app.metadataCache.getFileCache(tempFile);
          if (cache) return cache;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
      };
      const fileMetadata = await getCache();
      if (await this.app.vault.adapter.exists(tempFile.path)) {
        await this.app.vault.delete(tempFile);
      }
      return fileMetadata;
    };
    const curContentMetadata = await parseContent(contentWithRefTable);
    const contentWithRef = await this.replaceLinksWithContent(
      contentWithRefTable,
      curContentMetadata,
      false,
      true
    );
    logger(
      `Execution time to extract instruction: ${performance.now() - startTime} ms`
    );
    return contentWithRef;
  }

  async loadFileContent(filePath: string): Promise<string | null> {
    const file = await this.app.vault.getAbstractFileByPath(filePath);
    if (!file) return null;
    const content = await this.app.vault.read(file as TFile);
    return content;
  }

  async createTempFile(content: string) {
    const tempFile = await this.app.vault.create(
      `temp-${Date.now()}.md`,
      content
    );
    return tempFile;
  }

  async extractChildrenInfo(
    fileCache: {
      links?: {
        original: string;
        link: string;
        position?: any;
      }[];
      embeds?: {
        original: string;
        link: string;
        position?: any;
      }[];
    },
    extractEmbeddedBlocks = true,
    extractMentionedDocs = true
  ): Promise<ExtendedChildFile[]> {
    // Extended children includes mentioned docs and block embedding
    const children: ExtendedChildFile[] = [];

    logger("getChildrenContent.fileCache", fileCache);

    const links = [
      ...(extractMentionedDocs
        ? fileCache?.links?.filter(
            (e) => e.original.substring(0, 2) === "[["
          ) || []
        : []),
      ...(extractEmbeddedBlocks
        ? fileCache?.embeds?.filter(
            (e) => e.original.substring(0, 3) === "![["
          ) || []
        : []),
    ];

    logger("getChildrenContent.links", links);

    if (!links) return children;

    for (let i = 0; i < links.length; i++) {
      const link = links[i] || "";
      // Remove the block citation from the link
      const [processedLink, citingBlockHash] = link.link.split("#^");

      if (!processedLink) continue;

      const path = this.app.metadataCache.getFirstLinkpathDest(
        processedLink,
        ""
      )?.path;

      if (!path) continue;

      const file: TFile = this.app.vault.getAbstractFileByPath(path);

      if (!file) continue;

      // load the file
      let content = await this.app.vault.read(file as any);
      if (citingBlockHash) {
        // split by "\n"
        const contentBlocks = content.split("\n");
        // find the block with the hash
        const blockIndex = contentBlocks.findIndex((block) =>
          block.includes(citingBlockHash)
        );
        if (blockIndex !== -1) {
          content = contentBlocks[blockIndex].replaceAll(
            `^${citingBlockHash}`,
            ""
          );
        }
      }

      const metadata = this.getMetaData(file.path);

      const childInfo: ExtendedChildFile = {
        ...file,
        content,
        title: file.name.substring(0, file.name.length - 2),
        position: link.position,
        isEmbeddedBlock: link.original.substring(0, 3) === "![[",
        isMentionedDoc: link.original.substring(0, 2) === "[[",
        frontmatter: metadata?.frontmatter,
        headings: metadata?.headings,
      };

      children.push(childInfo);
    }
    // Sort children based on position
    children.sort((a, b) => {
      // The 'offset' represents the character index in the entire document.
      // A higher offset means the content appears later in the document.
      const aOffset = a.position?.end?.offset || 0;
      const bOffset = b.position?.end?.offset || 0;
      return bOffset - aOffset; // Sort in descending order (end to start)
    });

    logger("extractChildrenInfo.children", children);

    // Now 'children' is sorted from end to start, allowing for
    // easier replacement of content without affecting earlier positions.
    return children;
  }

  async replaceLinksWithContent(
    content: string,
    fileCache: any,
    resolveEmbeddedBlock = true,
    resolveMentionedDocs = true,
    addCitationAtEnd = true
  ) {
    const children = await this.extractChildrenInfo(
      fileCache,
      resolveEmbeddedBlock,
      resolveMentionedDocs
    );

    // Create a copy of the original content
    let updatedContent = content;
    if (addCitationAtEnd && children.some((child) => child.isMentionedDoc)) {
      updatedContent = updatedContent + "\n***\nMentioned citation content:";
    }

    // Iterate through sorted children (from end to front)
    for (const child of children) {
      if (child.isEmbeddedBlock) {
        // Replace the link with the child's content
        updatedContent =
          updatedContent.slice(0, child.position.start.offset) +
          `${child.content}` +
          updatedContent.slice(child.position.end.offset);
      } else if (child.isMentionedDoc) {
        // The first line of the child's content is the title. Exclude it.
        const contentWithoutTitle = child.content
          .split("\n")
          .slice(1)
          .join("\n");

        const originalCitationString = updatedContent.slice(
          child.position.start.offset,
          child.position.end.offset
        );
        const citationPrefix = "[C] ";
        const formattedCitationString = originalCitationString.replaceAll(
          citationPrefix,
          ""
        );

        // @NOTE: Do not find and replace all.
        // That will change the position of the next citation that we process
        updatedContent =
          updatedContent.slice(0, child.position.start.offset) +
          formattedCitationString +
          updatedContent.slice(child.position.end.offset);

        if (addCitationAtEnd) {
          // add the child's content to the end of updatedContent
          updatedContent = `${updatedContent}\n\n${formattedCitationString}:\n${contentWithoutTitle}`;
        } else {
          // add the child's content to the end of position.end.offset
          updatedContent =
            updatedContent.slice(
              0,
              child.position.end.offset - citationPrefix.length
            ) +
            `(Citation content: ${contentWithoutTitle})` +
            updatedContent.slice(
              child.position.end.offset - citationPrefix.length
            );
        }
      }
    }

    return updatedContent;
  }

  detectAndConvertTables(content: string): string {
    // Regular expression to match Markdown tables, including the header
    const tableRegex =
      /((?:^|\n)#+\s*.*\n+)(\|(.+)\|[\r\n]+\|([-:\s|]+)\|[\r\n]+([\s\S]+?))(?=\n\n|\n*$)/g;

    let updatedContent = content;
    let match;

    while ((match = tableRegex.exec(content)) !== null) {
      const fullMatch = match[2];
      const headers = match[3]
        .split("|")
        .map((header) => header.trim())
        .filter(Boolean);
      const rowsContent = match[5];

      const rows = this.parseTableRows(rowsContent, headers.length);

      const tables: TableRow[] = rows
        .map((row) => {
          const tableRow: TableRow = {};
          headers.forEach((header, index) => {
            tableRow[header] = row[index] || "";
          });
          return tableRow;
        })
        .filter((row) => Object.values(row).some((value) => value !== "")); // Filter out completely empty rows

      // Skip empty tables
      if (tables.length === 0) {
        continue;
      }

      // Convert the table array to a JSON string
      const jsonString = JSON.stringify(tables, null, 2);

      // Replace the original table with the JSON string
      updatedContent = updatedContent.replace(fullMatch, jsonString);
    }

    return updatedContent;
  }

  private parseTableRows(content: string, columnCount: number): string[][] {
    const rows: string[][] = [];
    const lines = content.split("\n");
    let buffer = "";
    for (let i = 0; i <= lines.length; i++) {
      const line = lines[i] || "";
      // If the line starts with '|' and ends with '|', we consider it a new row
      if (
        (line.trim().startsWith("|") && line.trim().endsWith("|")) ||
        i === lines.length
      ) {
        if (buffer) {
          // Process the buffered lines
          const rowText = buffer;
          const cells = this.splitRowIntoCells(rowText);
          rows.push(cells);
          buffer = "";
        }
        buffer = line;
      } else {
        // Continue buffering lines
        buffer += "\n" + line;
      }
    }
    return rows;
  }

  private splitRowIntoCells(rowText: string): string[] {
    const cells: string[] = [];
    let currentCell = "";
    let linkDepth = 0;
    let i = 0;

    // Remove leading and trailing '|' and trim
    rowText = rowText.trim();
    if (rowText.startsWith("|")) {
      rowText = rowText.slice(1);
    }
    if (rowText.endsWith("|")) {
      rowText = rowText.slice(0, -1);
    }
    rowText = rowText.trim();

    while (i < rowText.length) {
      const ch = rowText[i];

      if (ch === "[" && rowText.slice(i, i + 3) === "[[[") {
        linkDepth++;
        currentCell += "[[[";
        i += 3;
        continue;
      } else if (ch === "]" && rowText.slice(i, i + 2) === "]]") {
        linkDepth--;
        currentCell += "]]";
        i += 2;
        continue;
      } else if (ch === "|" && linkDepth === 0) {
        // Cell separator
        cells.push(currentCell.trim());
        currentCell = "";
        i++;
        continue;
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    }
    // Add the last cell
    cells.push(currentCell.trim());
    return cells;
  }

  async getHighlights(editor: ContentManager) {
    const content = await editor.getValue();
    const highlights =
      content.match(/==(.*?)==/gi)?.map((s: any) => s.replaceAll("==", "")) ||
      [];
    return highlights;
  }

  async getClipboard() {
    return await navigator.clipboard.readText();
  }

  async getMentions(title: string) {
    const linked: any = [];
    const unlinked: any = [];
    const files = this.app.vault.getMarkdownFiles();

    await Promise.all(
      files.map(async (file) => {
        const content = await this.app.vault.cachedRead(file);

        const regLinked = new RegExp(`.*\\[\\[${title}\\]\\].*`, "ig");
        const resultsLinked = content.match(regLinked);
        if (resultsLinked) {
          linked.push({
            ...file,
            title: file.basename,
            results: resultsLinked,
          });
        }

        const regUnlinked = new RegExp(`.*${title}.*`, "ig");
        const resultsUnlinked = content.match(regUnlinked);
        if (resultsUnlinked) {
          unlinked.push({
            ...file,
            title: file.basename,
            results: resultsUnlinked,
          });
        }
      })
    );

    console.log({ linked, unlinked });

    return { linked, unlinked };
  }

  async getStarredBlocks(path = "") {
    const fileCache = this.getMetaData(path);
    let content = "";
    const staredHeadings = fileCache?.headings?.filter(
      (e: { heading: string }) =>
        e.heading.substring(e.heading.length - 1) === "*"
    );
    if (staredHeadings) {
      for (let i = 0; i < staredHeadings.length; i++) {
        content += await this.getTextBloc(staredHeadings[i].heading);
      }
    }
    return content;
  }

  async getTextBloc(heading: string, path = "") {
    const fileCache = this.getMetaData(path);
    let level = -1;
    let start = -1;
    let end = -1;
    if (!fileCache?.headings?.length) {
      console.error("Headings not found");
      return;
    }

    for (let i = 0; i < (fileCache?.headings?.length || 0); i++) {
      const ele = fileCache.headings[i];
      if (start === -1 && ele?.heading === heading) {
        level = ele.level;
        start = ele.position.start.offset;
      } else if (start >= 0 && ele.level <= level && end === -1) {
        end = ele.position.start.offset;
        break;
      }
    }

    if (start >= 0 && fileCache.path) {
      const doc = await this.app.vault.getAbstractFileByPath(fileCache.path);
      const docContent = await this.app.vault.read(doc as TFile);
      if (end === -1) end = docContent.length;
      return docContent.substring(start, end);
    } else {
      console.error("Heading not found ");
    }
  }

  async getExtractions(filePath?: string, editor?: ContentManager) {
    const extractedContent: Record<string, string[]> = {};

    const contentExtractor = new ContentExtractor(this.app, this.plugin);
    const extractorMethods = getExtractorMethods().filter(
      (e) =>
        this.plugin.settings.extractorsOptions[
          e as keyof typeof this.plugin.settings.extractorsOptions
        ]
    );

    const targetFile = filePath
      ? this.app.vault.getAbstractFileByPath(filePath) ||
        this.app.workspace.getActiveFile()
      : this.app.workspace.getActiveFile();

    const targetFileContent = editor
      ? await editor.getValue()
      : await this.app.vault.cachedRead(targetFile as any);

    if (!targetFile) throw new Error("ActiveFile was undefined");

    for (let index = 0; index < extractorMethods.length; index++) {
      const key = extractorMethods[index];
      contentExtractor.setExtractor(key);

      const links = await contentExtractor.extract(
        targetFile.path,
        targetFileContent
      );

      if (links.length > 0) {
        const parts = await Promise.all(
          links.map((link) => contentExtractor.convert(link))
        );
        extractedContent[UnExtractorSlug[key]] = parts;
      }
    }

    return extractedContent;
  }

  getActiveFile() {
    return this.app.workspace.getActiveFile();
  }

  getMetaData(path?: string, withoutCompatibility?: boolean) {
    const activeFile = !path
      ? this.plugin.textGenerator.embeddingsScope.getActiveNote()
      : { path };

    if (!activeFile?.path || !activeFile.path.endsWith(".md")) return null;

    const cache = this.plugin.app.metadataCache.getCache(activeFile.path);

    return {
      ...cache,

      frontmatter: {
        ...cache?.frontmatter,
        outputToBlockQuote: undefined || cache?.frontmatter?.outputToBlockQuote,

        ...(!withoutCompatibility && {
          PromptInfo: {
            ...cache?.frontmatter,
            ...cache?.frontmatter?.PromptInfo,
          },

          config: {
            ...cache?.frontmatter,
            ...cache?.frontmatter?.config,
            path_to_choices:
              cache?.frontmatter?.choices ||
              cache?.frontmatter?.path_to_choices,
            path_to_message_content:
              cache?.frontmatter?.pathToContent ||
              cache?.frontmatter?.path_to_message_content,
          },

          custom_body:
            cache?.frontmatter?.body || cache?.frontmatter?.custom_body,
          custom_header:
            cache?.frontmatter?.headers || cache?.frontmatter?.custom_header,

          bodyParams: {
            ...cache?.frontmatter?.bodyParams,
            ...(cache?.frontmatter?.max_tokens
              ? { max_tokens: cache?.frontmatter?.max_tokens }
              : {}),
            ...getOptionsUnder("body.", cache?.frontmatter),
          },

          reqParams: {
            ...cache?.frontmatter?.reqParams,
            ...getOptionsUnder("reqParams.", cache?.frontmatter),
            ...(cache?.frontmatter?.body
              ? { body: cache?.frontmatter?.body }
              : {}),
          },

          splitter: {
            ...cache?.frontmatter?.chain,
            ...getOptionsUnder("splitter.", cache?.frontmatter),
          },
          chain: {
            ...cache?.frontmatter?.chain,
            ...getOptionsUnder("chain.", cache?.frontmatter),
          },
        }),
        ...(path ? { templatePath: path } : {}),
      },

      path: activeFile.path,
    };
  }

  getMetaDataAsStr(frontmatter: Record<string, string | any[]>) {
    let cleanFrontMatter = "";
    for (const [key, value] of Object.entries(frontmatter) as Array<
      [string, string | any[]]
    >) {
      logger("getMetaDataAsStr.key", key);
      if (
        !value ||
        key.includes(".") ||
        IGNORE_IN_YAML[key] ||
        key.startsWith("body") ||
        key.startsWith("header")
      )
        continue;
      if (Array.isArray(value)) {
        cleanFrontMatter += `${key} : `;
        value.forEach((v) => {
          cleanFrontMatter += `${v}, `;
        });
        cleanFrontMatter += `\n`;
      } else if (typeof value == "object") {
        continue;
      } else {
        cleanFrontMatter += `${key} : ${value} \n`;
      }
    }
    logger("getMetaDataAsStr.cleanFrontMatter", cleanFrontMatter);
    return cleanFrontMatter;
  }

  async processCodeBlocks(
    input: string,
    processor: CodeBlockProcessor
  ): Promise<string> {
    const regex = /```(.+?)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    let output = input;

    while ((match = regex.exec(input)) !== null) {
      const full = match[0];
      const type = match[1];
      const content = match[2];
      const block = { type, content, full };
      const replacement = await processor(block); // Assuming 'process' is a method in the CodeBlockProcessor class
      output = output.replace(full, replacement);
    }
    return output;
  }

  private _dataviewApi: any;
  async execDataview(
    md: string,
    _cache: Record<string, string | undefined> = {}
  ): Promise<string> {
    if (!md || typeof md != "string") return md;

    // Process code blocks and dataview/dataviewjs blocks if needed.
    const parsedTemplateMD: string = await this.processCodeBlocks(
      md,
      async ({ type, content, full }) => {
        try {
          switch (type.trim()) {
            case "dataview": {
              const api = (this._dataviewApi =
                this._dataviewApi || (await getDataviewApi(this.app)));
              const res = await api?.queryMarkdown(content);

              if (!res) throw new Error("Couln't find DataViewApi");

              if (res?.successful) {
                return (_cache[content] = _cache[content] || res.value);
              }

              throw new Error(((res || []) as unknown as string[])?.join(", "));
            }
            case "dataviewjs": {
              const api = (this._dataviewApi =
                this._dataviewApi || (await getDataviewApi(this.app)));
              const container = document.createElement("div");
              const component = new Component();

              api?.executeJs(content, container, component, "");

              return (_cache[content] = _cache[content] || container.innerHTML);
            }
            default:
              return full;
          }
        } catch (err: any) {
          this.plugin.handelError(err);
          return "";
        }
      }
    );
    return parsedTemplateMD;
  }

  getHBVariablesOfTemplate(...sections: (string | undefined)[]) {
    const vars = new Set<string>([]);

    for (const section of sections) {
      for (const v of getHBValues(section || "")) {
        vars.add(v);
      }
    }

    return Array.from(vars.values());
  }

  getHBVariablesObjectOfTemplate(...sections: (string | undefined)[]) {
    const vars: Record<string, true> = {};

    for (const section of sections) {
      for (const v of getHBValues(section || "")) {
        vars[v] = true;
      }
    }

    return vars;
  }

  // This function returns all the text before the cursor's current position
  async getBeforeCursor(editor: ContentManager): Promise<string> {
    const cursor = await editor.getCursor();
    const beforeCursor = await editor.getRange(undefined, cursor);
    return beforeCursor;
  }

  // This function returns all the text after the cursor's current position
  async getAfterCursor(editor: ContentManager): Promise<string> {
    const cursor = await editor.getCursor("to");
    const afterCursor = await editor.getRange(cursor, undefined);
    return afterCursor;
  }

  // This function returns the entire paragraph where the cursor is currently located
  async getCursorParagraph(editor: ContentManager): Promise<string> {
    return await editor.getCurrentLine();
  }

  // This function returns the sentence immediately surrounding the cursor, including sentences that the cursor is in the middle of
  async getCursorSentence(editor: ContentManager): Promise<string> {
    const stoppers = ["\n", ".", "?", "!"];
    const part1 = walkUntilTrigger(
      await this.getBeforeCursor(editor),
      stoppers,
      true
    );
    const part2 = walkUntilTrigger(await this.getAfterCursor(editor), stoppers);
    return part1 + "\n" + part2;
  }

  // This function returns the next word relative to the cursor's position
  async getNextWord(editor: ContentManager): Promise<string> {
    const txts = (await this.getAfterCursor(editor)).split(" ");
    return txts[0]?.trim() || txts[1]?.trim() || "";
  }

  // This function returns the previous word relative to the cursor's position
  async getPreviousWord(editor: ContentManager): Promise<string> {
    const txts = (await this.getBeforeCursor(editor)).trim().split(" ");
    return txts[txts.length - 1]?.trim() || txts[txts.length - 2]?.trim() || "";
  }

  // This function selects everything except the currently selected text
  async getInverseSelection(editor: ContentManager): Promise<string> {
    const content = await editor.getValue();
    const selection = await editor.getSelection();
    const inverseSelection = content.replace(selection, "");
    return inverseSelection;
  }

  handlebarsMiddleware(
    hb: HandlebarsTemplateDelegate<any>
  ): HandlebarsTemplateDelegate<any> {
    return (async (
      context: any,
      options?: Handlebars.RuntimeOptions | undefined
    ) => {
      let hbd = await hb(context, options);
      hbd = await this.execDataview(hbd);
      return hbd;
    }) as any;
  }

  extractFrontmatterFromTemplateContent(templateContent: string) {
    const regex = /---([\s\S]*?)---/;
    const match = templateContent.match(regex);

    // turn yaml it into an object
    const yaml = match ? match[1] : "";
    const obj = this.yamlToObj(yaml);
    return obj;
  }

  /** Simple yaml parser, as fallback */
  yamlToObj(yaml: string) {
    const frontmatterRegex = /---\n([\s\S]+?)\n---/;
    const match = yaml.match(frontmatterRegex);
    if (!match) return {};

    const frontmatterStr = match[1];
    const lines = frontmatterStr.split("\n");
    const frontmatter: Record<string, any> = {};
    lines.forEach((line) => {
      const [key, value] = line.split(": ").map((s) => s.trim());
      frontmatter[key] = value;
    });
    return frontmatter;
  }
}

export function getOptionsUnder(
  prefix: string,
  obj: Record<string, any> | undefined
) {
  let options: Record<string, any> = {};

  Object.entries(obj || {}).map(([key, data]) => {
    if (key.startsWith(prefix)) {
      options = set(options, key, data);
    }
  });

  return options[prefix.substring(0, prefix.length - 1)];
}

export const contextVariablesObj: Record<
  string,
  {
    example: string;
    hint?: string;
  }
> = {
  title: {
    example: "{{title}}",
    hint: "Represents the note's title.",
  },
  content: {
    example: "{{content}}",
    hint: "Represents the entirety of the note's content.",
  },
  contentWithRef: {
    example: "{{contentWithRef}}",
    hint: "The note's content with references converted to their content.",
  },
  instructionAddtlContext: {
    example: "{{instructionAddtlContext}}",
    hint: "The content of the instruction file referenced by the instructionAddtlContext variable.",
  },
  selection: {
    example: "{{selection}}",
    hint: "The portion of text that has been selected by the user.",
  },
  tg_selection: {
    example: "{{tg_selection}}",
    hint: "The text selected using the text generator method.",
  },

  inverseSelection: {
    example: `{{inverseSelection}}`,
    hint: "Shows an error notice when the inverse selection (excluding the currently selected text) is empty.",
  },

  previousWord: {
    example: `{{previousWord}}`,
    hint: "Shows an error notice when the previous word relative to the cursor's position is empty.",
  },

  nextWord: {
    example: `{{nextWord}}`,
    hint: "Shows an error notice when the next word relative to the cursor's position is empty.",
  },

  cursorParagraph: {
    example: `{{cursorParagraph}}`,
    hint: "Shows an error notice when the paragraph where the cursor is currently located is empty.",
  },

  cursorSentence: {
    example: `{{cursorSentence}}`,
    hint: "Shows an error notice when the sentence surrounding the cursor is empty.",
  },

  beforeCursor: {
    example: `{{beforeCursor}}`,
    hint: "Shows an error notice when the text before the cursor's current position is empty.",
  },

  afterCursor: {
    example: `{{afterCursor}}`,
    hint: "Shows an error notice when the text after the cursor's current position is empty.",
  },

  starredBlocks: {
    example: "{{starredBlocks}}",
    hint: "Content under headings marked with a star (*) in the note.",
  },

  clipboard: {
    example: "{{clipboard}}",
    hint: "The current content copied to the clipboard.",
  },
  selections: {
    example: "{{#each selections}} {{this}} {{/each}}",
    hint: "All selected text segments in the note, especially when multiple selections are made.",
  },
  highlights: {
    example: "{{#each highlights}} {{this}} {{/each}}",
    hint: "Highlighted segments marked with ==...== in the note.",
  },
  children: {
    example: "{{#each children}} {{this.content}} {{/each}}",
    hint: "An array of notes or sub-notes that are cited or related to the primary note.",
  },
  "mentions(linked)": {
    example: "{{#each mentions.linked}} {{this.results}} {{/each}}",
    hint: "Mentions across the entire vault where a note is directly linked, e.g., [[note]].",
  },
  "mentions(unlinked)": {
    example: "{{#each mentions.unlinked}} {{this.results}} {{/each}}",
    hint: "Mentions across the vault where a note is referenced without a direct link, e.g., '...note...'.",
  },
  extractions: {
    example: `{{#each extractions}} {{this}} {{/each}}

Or
{{#each extractions.pdf}} {{this}} {{/each}}
    `,
    hint: `Extracted content from various sources like PDFs, images, audio files, web pages, and YouTube URLs. possible extractons: ${Object.keys(
      ExtractorSlug
    ).join(", ")}`,
  },
  headings: {
    example: `{{#each headings}}
# HEADER: {{@key}} 
{{this}} 
{{/each}}`,
    hint: "Contains all the headings within the note and their respective content.",
  },

  metadata: {
    example: `{{metadata}}`,
    hint: "The initial metadata of the note, often provided in YAML format.",
  },

  yaml: {
    example: `{{#each yaml}} 
{{@key}}: {{this}} 
{{/each}}`,
    hint: "The initial metadata (Object) of the note.",
  },

  // extractors
  extract: {
    example: `{{#extract "web_md" "var1" "a"}}
  http://www.google.com
{{/extract}}

Or

{{extract "pdf" "test.pdf"}}
{{extract "youtube" "ytUrl"}}
{{extract "web" "https://example.com"}}`,
    hint: "Extracts content from various sources like PDFs, images, audio files, web pages, and YouTube URLs. possible values: web_md, web_html, pdf, yt, img, audio",
  },

  read: {
    example: `{{read "readme.md"}}`,
    hint: "Reads the content of a file from the vault",
  },

  write: {
    example: `{{#write "readme.md"}}
  text {{selection}}
{{/write}}

Or
{{write "readme.md" selection}}
`,
    hint: "Writes a text or variable into a file",
  },

  append: {
    example: `{{#append "readme.md"}}
  text {{selection}}
{{/append}}

Or
{{append "readme.md" selection}}
`,
    hint: "Appends a text or variable into a file",
  },

  run: {
    example: `{{#run "otherTemplateId" "var1" "selection"}}
  this text will be the "selection" variable for the other template
  it can be any variable even custom ones
{{/run}}

Or
{{#run "otherTemplateId" "var1"}}
  this text will be the "tg_selection" variable for the other template
{{/run}}
`,
    hint: "Runs another template, and sending a value to it, the result will be stored in a variable(var1).",
  },

  script: {
    example: `{{#script}}
  return "hello world";
{{/script}}

Or
{{#script "otherTemplateId" "var1"}}
\`\`\`js
  return "hello world";
\`\`\`
{{/script}}
`,
    hint: "Runs javascript code, avoid using it for security reasons.",
  },

  get: {
    example: `{{get "var1"}}`,
    hint: "Gets value of a variable",
  },

  set: {
    example: `{{#set "var1"}}
    text {{selection}}
{{/set}}

  Or
{{set "var1" selection}}
  `,
    hint: "Gets value of a variable",
  },

  log: {
    example: `{{log "test" selection}}`,
    hint: "Logs anything to console (open console in devtools Ctrl+Shift+i)",
  },

  notice: {
    example: `{{notice "test"}}`,
    hint: "Shows a notice to the user",
  },

  error: {
    example: `{{error "Selection was empty"}}`,
    hint: "Shows a error notice to the user, and it will stop the execution.",
  },

  keys: {
    example: `{{keys.openAIChat}}`,
    hint: "Gives access to generic provider's api keys",
  },
  dataview: {
    example: `{{#dataview}}
    TABLE file.name, file.size
    WHERE file.size > 2048
{{/dataview}}`,
    hint: "Gives access to generic provider's api keys",
  },
};
