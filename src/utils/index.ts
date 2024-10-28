/* eslint-disable no-control-regex */
import {
  App,
  ViewState,
  WorkspaceLeaf,
  TFile,
  ListItemCache,
  SectionCache,
} from "obsidian";
import {
  AsyncReturnType,
  FileViewMode,
  Message,
  NewTabDirection,
} from "../types";
import debug from "debug";
const logger = debug("textgenerator:setModel");

interface BlockUpdate {
  offset: number;
  blockId: string;
  shouldInsertNewline: boolean;
}

export function makeId(length: number) {
  logger("makeId");
  let result = "";
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  logger("makeId end", result);
  return result;
}
/**
 * Copied from Quick Add  https://github.com/chhoumann/quickadd/blob/2d2297dd6b2439b2b3f78f3920900aa9954f89cf/src/engine/QuickAddEngine.ts#L15
 * @param folder
 */
export async function createFolder(folder: string, app: App): Promise<void> {
  logger("createFolder", folder);
  const folderExists = await app.vault.adapter.exists(folder);

  if (!folderExists) {
    await app.vault.createFolder(folder);
  }
  logger("createFolder end");
}

/**
 *  Copied from Quick Add https://github.com/chhoumann/quickadd/blob/2d2297dd6b2439b2b3f78f3920900aa9954f89cf/src/engine/QuickAddEngine.ts#L50
 * @param filePath
 * @param fileContent
 * @returns
 */
export async function createFileWithInput(
  filePath: string,
  fileContent: string,
  app: App
): Promise<TFile> {
  logger("createFileWithInput", filePath, fileContent);
  const dirMatch = filePath.match(/(.*)[/\\]/);
  let dirName = "";
  if (dirMatch) dirName = dirMatch[1];

  if (!(await app.vault.adapter.exists(dirName)))
    await createFolder(dirName, app);

  // Sanitize the file name. Can't contain ":"
  let sanitizedFilePath = filePath.replace(/[:]/g, "_");

  // Check if file already exists
  if (await app.vault.adapter.exists(sanitizedFilePath)) {
    // If it does, add 4 random characters to the filename
    const fileExtension = sanitizedFilePath.split(".").pop();
    const fileNameWithoutExtension = sanitizedFilePath.slice(
      0,
      -(fileExtension?.length ?? 0) - 1
    );
    sanitizedFilePath = `${fileNameWithoutExtension}-${makeId(4)}.${fileExtension}`;
    logger("File already exists. Created new filename:", sanitizedFilePath);
  }

  return await app.vault.create(sanitizedFilePath, fileContent);
}

/*
 * Copied from Quick Add  https://github.com/chhoumann/quickadd/blob/2d2297dd6b2439b2b3f78f3920900aa9954f89cf/src/utility.ts#L150
 */

export async function openFile(
  app: App,
  file: TFile,
  optional?: {
    openInNewTab?: boolean;
    direction?: NewTabDirection;
    mode?: FileViewMode;
    focus?: boolean;
  }
) {
  logger("openFile", file, optional);
  let leaf: WorkspaceLeaf;

  if (optional?.openInNewTab && optional?.direction) {
    leaf = app.workspace.splitActiveLeaf(optional.direction);
  } else {
    leaf = app.workspace.getUnpinnedLeaf();
  }

  await leaf.openFile(file);

  if (optional?.mode || optional?.focus) {
    await leaf.setViewState(
      {
        ...leaf.getViewState(),
        state:
          optional.mode && optional.mode !== "default"
            ? { ...leaf.view.getState(), mode: optional.mode }
            : leaf.view.getState(),
        popstate: true,
      } as ViewState,
      { focus: optional?.focus }
    );
  }
  logger("openFile end");
}

export function removeYAML(content: string) {
  logger("removeYAML", content);

  // Use a non-greedy match for the content between ---
  const match = content.match(/^---([\s\S]*?)---/m);

  if (match && match.index === 0) {
    // If the match starts at the beginning of the content, remove it
    const newContent = content.slice(match[0].length);
    logger("removeYAML", newContent);
    return newContent;
  } else {
    // If there is no match or it doesn't start at the beginning, return the original content
    logger("removeYAML", content);
    return content;
  }
}

export function removeExtensionFromName(name: string) {
  logger("removeExtension", name);
  const arr = name.contains(".") ? name.split(".") : [name, ""];
  arr.pop();
  const res = arr.join(".");
  logger("removeExtension", res);
  return res;
}

export function numberToKFormat(number: number) {
  if (number >= 1000) {
    return (number / 1000).toFixed(1) + "k";
  } else {
    return number.toString();
  }
}

export function transformStringsToChatFormat(arr: string[]) {
  const roles = ["user", "assistant"]; // define the roles
  const result: { role: string; content: string }[] = []; // initialize the result array
  for (let i = 0; i < arr.length; i++) {
    result.push({
      role: roles[i % 2], // alternate between the two roles
      content: arr[i],
    });
  }

  return result;
}

// Adapted from Stackoverflow: https://stackoverflow.com/a/6969486/19687
export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export async function getContextAsString(
  context: Record<string, string | string[]>,
  template?: string
) {
  if (template) {
    const ctxt = Handlebars.compile(template)(context);
    return ctxt;
  }

  let contextString = "";

  for (const key in context) {
    if (!context[key] || key == "content") continue;

    contextString += `${key}:`;

    // Check if value is an array and join with \n
    if (Array.isArray(context[key])) {
      contextString += `${(context[key] as string[]).join("\n")}\n`;
    } else {
      contextString += `${context[key]}\n`;
    }
  }
  return contextString;
}

export function removeRepetitiveObjects<T>(objects: T[], key = "path"): T[] {
  const uniqueObjects: { [key: string]: T } = {};
  for (const obj of objects) {
    const objKey: any = obj?.[key as keyof typeof obj];
    if (!(objKey in uniqueObjects)) {
      uniqueObjects[objKey] = obj;
    }
  }

  return Object.values(uniqueObjects).filter(Boolean) as T[];
}

import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage,
} from "@langchain/core/messages";

export function mapMessagesToLangchainMessages(
  messages: Message[]
): BaseMessage[] {
  return messages.map((msg) => {
    const msgF =
      typeof msg.content == "string"
        ? msg.content
        : {
            name: msg.role,
            content: msg.content,
          };

    switch (msg.role?.toLocaleLowerCase()) {
      case "system":
        return new SystemMessage(msgF);
      case "assistant":
        return new AIMessage(msgF);
      default:
        return new HumanMessage(msgF);
    }
  });
}

export function containsInvalidCharacter(inputString: string) {
  const invalidCharRegex = /[^\x00-\x7F]+/g;
  return invalidCharRegex.test(inputString);
}

export function cleanConfig<T>(options: T): T {
  const cleanedOptions: any = {}; // Create a new object to store the cleaned properties

  for (const key in options) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      const value = options[key];

      // Check if the value is not an empty string
      if (value != undefined && (typeof value !== "string" || value !== "")) {
        cleanedOptions[key] = value; // Copy non-empty properties to the cleaned object
      }
    }
  }

  return cleanedOptions;
}

export async function processPromisesSetteledBatch<
  T extends () => Promise<any>,
>(
  items: Array<AsyncReturnType<T>>,
  limit: number,
  waitingBetween = 10
): Promise<PromiseSettledResult<any>[]> {
  let results: PromiseSettledResult<Awaited<AsyncReturnType<T>>>[] = [];
  for (let batchNum = 0; batchNum < items.length; batchNum += limit) {
    const end =
      batchNum + limit > items.length ? items.length : batchNum + limit;

    const slicedResults = await Promise.allSettled(items.slice(batchNum, end));

    await new Promise((s) => setTimeout(s, waitingBetween));

    results = [...results, ...slicedResults];
  }

  return results;
}

export function promiseForceFullfil(item: any) {
  // return the failed reson
  return item.status == "fulfilled" ? item.value : `FAILED: ${item?.reason}`;
}

import { SystemMessagePromptTemplate } from "@langchain/core/prompts";
import get from "lodash.get";
import { Handlebars } from "#/helpers/handlebars-helpers";

export function compilePrompt(prompt: string, vars: string[]) {
  let newPrompt = prompt;

  for (const v of vars) {
    newPrompt = newPrompt.replaceAll(`{${v}}`, `{{${v}}}`);
  }

  return newPrompt;
}

export function compileLangMessages(
  msgs: {
    prompt: {
      inputVariables: string[];
      template: string;
    };
  }[]
) {
  const messages: string[] = [];
  let system = "";
  msgs.forEach((msg) => {
    console.log(msg);
    if (msg instanceof SystemMessagePromptTemplate) {
      system += compilePrompt(msg.prompt.template, msg.prompt.inputVariables);
    } else {
      messages.push(
        compilePrompt(msg.prompt.template, msg.prompt.inputVariables)
      );
    }
  });

  return {
    messages,
    system,
  };
}

export function trimBy<T>(objects: T[], propertyName: string): T[] {
  const uniqueValues = new Set();
  const result: T[] = [];

  for (const obj of objects) {
    const value = get(obj, propertyName);

    if (!uniqueValues.has(value)) {
      uniqueValues.add(value);
      result.push(obj);
    }
  }

  return result;
}

export function replaceScriptBlocksWithMustachBlocks(templateString: string) {
  if (!templateString) return "";
  // Regular expressions for matching the script tags
  const startScriptRegex = /{{\s*#script\s*}}/g;
  const endScriptRegex = /{{\s*\/script\s*}}/g;
  const quadErrorRegex = /{{{{{{\s*\/script\s*}}}}}}/g;

  // Replace all occurrences of {{#script}} and {{/script}} with {{{{script}}}} and {{{{/script}}}} respectively
  let updatedTemplateString = templateString
    .replace(startScriptRegex, "{{{{script}}}}")
    .replace(endScriptRegex, "{{{{/script}}}}");

  // Handle the case where {{{{/script}}}} is already present
  updatedTemplateString = updatedTemplateString.replace(
    quadErrorRegex,
    "{{{{/script}}}}"
  );

  return updatedTemplateString;
}

export function nFormatter(n?: number, digits = 1) {
  const num = n || 0;
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" },
  ];
  const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
  const item = lookup
    .slice()
    .reverse()
    .find(function (item) {
      return num >= item.value;
    });
  return item
    ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol
    : "0";
}

export function unpromisifyAsyncFunction<T>(asyncFunction: Promise<T>): T {
  let isAsyncComplete = false;
  let result: T;

  // Call the provided asynchronous function
  asyncFunction.then((asyncResult) => {
    result = asyncResult;
    isAsyncComplete = true;
  });

  // Use a while loop to wait for the asynchronous operation to complete
  while (!isAsyncComplete) {
    syncWait(10);
  }

  // Return the result synchronously
  // @ts-ignore
  return result;
}

const syncWait = (ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) continue;
};

export function walkUntilTrigger(
  inputStr: string,
  triggerStrings: string[],
  reversedWalk = false
): string {
  if (reversedWalk) {
    inputStr = inputStr.split("").reverse().join("");
  }

  let walkedStr = "";
  let index = 0;

  while (index < inputStr.length) {
    const currentChar: string = inputStr[index];
    walkedStr += currentChar;

    for (const trigger of triggerStrings) {
      if (walkedStr.endsWith(trigger)) {
        if (reversedWalk) {
          return walkedStr.split("").reverse().join("");
        } else {
          return walkedStr;
        }
      }
    }

    index++;
  }

  // If no trigger string is found, return the entire input string
  if (reversedWalk) {
    return inputStr.split("").reverse().join("");
  } else {
    return inputStr;
  }
}

export function debounce<T extends unknown[], R>(
  func: (...args: T) => Promise<R>,
  wait: number
): (...args: T) => Promise<R> {
  let timeout: NodeJS.Timeout | null;

  logger("debounce", func, wait);
  return function debouncedFunction(...args: T): Promise<R> {
    // @ts-ignore
    const context = this;

    return new Promise((resolve, reject) => {
      if (timeout !== null) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        logger("debouncedFunction", args);
        func
          .apply(context, args)
          .then((result: any) => resolve(result))
          .catch((error: any) => reject(error));
      }, wait);
    });
  };
}

export function currentDate() {
  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}-${day}`;
}

export function getCurrentTime() {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  return `${hours}${minutes}${seconds}`;
}

import JSON5 from "json5";
import TextGeneratorPlugin from "#/main";

export function extractJsonFromText(text: string) {
  const jsonRegex = /^```(json|JSON)([\s\S]+?)```/;

  const match = text.match(jsonRegex);
  if (match) {
    try {
      const jsonBlock = JSON5.parse(match[2]);
      return jsonBlock;
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return null;
    }
  } else {
    console.error("No JSON block found in the text.");
    return null;
  }
}

export const createTempFileForPreview = async (
  plugin: TextGeneratorPlugin,
  result: string,
  timeout = 10
) => {
  // Create a temporary file for review
  const tempFileName = `tmp/Complied-Prompt-Result-${Date.now()}.md`;
  const tempFile = await plugin.app.vault.create(tempFileName, result);

  // Open the temporary file.
  // Don't make it active since it will change the active leaf metadata later
  await plugin.app.workspace.openLinkText(tempFile.path, "", true, {
    active: false,
  });

  // Set a timeout to remove the temporary file after 10 seconds
  setTimeout(async () => {
    try {
      await plugin.app.vault.delete(tempFile);
      console.log(`Temporary file ${tempFileName} has been removed.`);
    } catch (error) {
      console.error(`Failed to remove temporary file ${tempFileName}:`, error);
    }
  }, timeout * 1000);
};

export function parsePrompt(prompt: string) {
  // If prompt is a string that contains <|im_start|> and <|im_end|> separators,
  // then it is a concatenated string of messages, and we need to parse it into an array of messages
  const regex = /<\|im_start\|>(system|user)\n([\s\S]*?)<\|im_end\|>/g;
  const trimmedPrompt = prompt.trim();
  const matches = [...trimmedPrompt.matchAll(regex)];

  // If no matches or doesn't start with marker, treat as simple user message
  if (!matches.length || !trimmedPrompt.startsWith("<|im_start|>")) {
    return [{ role: "user", message: prompt.trim() }];
  }

  return matches.map((match) => ({
    role: match[1],
    message: match[2].trim(),
  }));
}

export async function convertJsonToTable(
  text: string,
  filePath?: string,
  app?: App
): Promise<string> {
  // Find the start of the JSON array, accounting for possible code block markers
  let startIndex = text.indexOf("[\n");
  if (startIndex === -1) return text;

  // Check if there's a code block marker before the JSON array
  const possibleMarkerStart = text.lastIndexOf("```", startIndex);
  const nextNewlineAfterMarker =
    possibleMarkerStart !== -1 ? text.indexOf("\n", possibleMarkerStart) : -1;

  // Verify if the marker is actually for this JSON array
  if (
    possibleMarkerStart !== -1 &&
    nextNewlineAfterMarker !== -1 &&
    nextNewlineAfterMarker < startIndex
  ) {
    // Adjust startIndex to skip the marker
    startIndex = nextNewlineAfterMarker + 1;
  }

  // Find the end of the JSON array
  const endIndex = text.indexOf("\n]", startIndex);
  if (endIndex === -1) return text;

  // Find possible closing marker
  const possibleMarkerEnd = text.indexOf("```", endIndex);
  const prevNewlineBeforeEndMarker =
    possibleMarkerEnd !== -1 ? text.lastIndexOf("\n", possibleMarkerEnd) : -1;

  // Determine the actual end position based on markers
  const actualEndIndex =
    prevNewlineBeforeEndMarker !== -1 && prevNewlineBeforeEndMarker > endIndex
      ? prevNewlineBeforeEndMarker
      : endIndex + 2;

  // Extract the JSON string (including the closing bracket)
  const jsonStr = text.substring(startIndex, endIndex + 2);

  try {
    let jsonData = JSON.parse(jsonStr);
    if (!Array.isArray(jsonData) || jsonData.length === 0) return text;

    // Update examples with block citations
    if (filePath && app) {
      jsonData = await updateExamplesWithBlockCitations(
        jsonData,
        filePath,
        app
      );
    }

    // Create table header
    const headers = Object.keys(jsonData[0] as any);
    let table = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`;

    // Create table rows
    jsonData.forEach((item: any) => {
      const row = headers.map((header: any) => {
        let cell = item[header] || "";
        cell = cell.toString().replace(/\|/g, "\\|").replace(/\n/g, "<br>");
        return cell;
      });
      table += `| ${row.join(" | ")} |\n`;
    });

    // Replace the JSON part with the table, including markers if they existed
    const replaceStart =
      possibleMarkerStart !== -1 ? possibleMarkerStart : startIndex;
    const replaceEnd =
      possibleMarkerEnd !== -1 ? possibleMarkerEnd + 3 : actualEndIndex;

    return text.substring(0, replaceStart) + table + text.substring(replaceEnd);
  } catch (error) {
    console.error("Error converting JSON to table:", error);
    return text;
  }
}

function generateId(): string {
  // Source: https://github.com/mgmeyers/obsidian-copy-block-link/blob/main/main.ts
  return Math.random().toString(36).substr(2, 6);
}

function shouldInsertAfter(block: ListItemCache | SectionCache) {
  // Source: https://github.com/mgmeyers/obsidian-copy-block-link/blob/main/main.ts
  if ((block as any).type) {
    return [
      "blockquote",
      "code",
      "table",
      "comment",
      "footnoteDefinition",
    ].includes((block as SectionCache).type);
  }
}

async function updateExamplesWithBlockCitations(
  jsonData: any[],
  filePath: string,
  app: App
) {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return jsonData;

  const content = await app.vault.read(file);
  const fileCache = app.metadataCache.getFileCache(file);
  const sections = (fileCache?.sections || []).filter(
    (section) => section.type === "paragraph"
  );
  // Collect all needed updates first
  const updates: BlockUpdate[] = [];
  const updatedExamples = new Map<number, string>(); // index -> blockEmbed

  for (const item of jsonData) {
    // Remove trailing period from the example text
    const llmCitedText = item.example.trim().replace(/\.$/, "");

    // Find the section that contains our paragraph
    const targetSection = sections.find((section) => {
      const sectionContent = content.slice(
        section.position.start.offset,
        section.position.end.offset
      );
      return sectionContent.includes(llmCitedText);
    });

    if (!targetSection) {
      console.log(`Could not find matching section for: '${llmCitedText}'`);
      continue;
    }

    let blockId = targetSection?.id;
    if (!blockId) {
      // Create new block ID and add it to the file
      blockId = generateId();
      updates.push({
        offset: targetSection.position.end.offset,
        blockId,
        shouldInsertNewline: shouldInsertAfter(targetSection) || false,
      });
    }
    // Generate the block embed link
    item.example = `!${app.fileManager.generateMarkdownLink(
      file,
      "",
      "#^" + blockId
    )}`;
  }
  // Sort updates from end to start to maintain position integrity
  updates.sort((a, b) => b.offset - a.offset);

  // Apply all updates at once
  let newContent = content;
  for (const update of updates) {
    const spacer = update.shouldInsertNewline ? "\n\n" : " ";
    const blockMark = `${spacer}^${update.blockId}`;

    newContent =
      newContent.slice(0, update.offset) +
      blockMark +
      newContent.slice(update.offset);
  }

  // Only modify file if there were any updates
  if (updates.length > 0) {
    await app.vault.modify(file, newContent);
  }

  return jsonData;
}
