import { Notice } from "obsidian";
import handlebars, { Exception, createFrame } from "handlebars";
import { pull } from "langchain/hub";
import { getAPI as getDataviewApi } from "obsidian-dataview";
import moment from "moment";
import asyncHelpers from "../lib/async-handlebars-helper";
import {
  compileLangMessages,
  createFileWithInput,
  createFolder,
} from "#/utils";

import { pluginApi } from "@vanakat/plugin-api";

export const Handlebars = asyncHelpers(handlebars);
import type ContextManager from "#/scope/context-manager";
import {
  ContentExtractor,
  ExtractorSlug,
  Extractors,
} from "#/extractors/content-extractor";
import { isMap, isSet } from "util/types";
import Read from "#/extractors";
import lodashSet from "lodash.set";
import lodashGet from "lodash.get";
import JSON5 from "json5";

import runJsInSandbox from "./javascript-sandbox";
import { AvailableContext } from "#/scope/context-manager";

export default function Helpersfn(self: ContextManager) {
  const extract = async (id: string, cntn: string, other: any) => {
    const ce = new ContentExtractor(self.app, self.plugin);

    ce.setExtractor(
      ExtractorSlug[id as keyof typeof ExtractorSlug] as keyof typeof Extractors
    );

    return await ce.convert(cntn, other);
  };

  const _runTemplate = async (id: string, metadata?: any) => {
    return await self.plugin.textGenerator.templateGen(id, {
      additionalProps: metadata,
    });
  };

  const write = async (path: string, data: string) => {
    return await createFileWithInput(path, data, self.plugin.app);
  };

  const append = async (path: string, data: string) => {
    const dirMatch = path.match(/(.*)[/\\]/);
    let dirName = "";
    if (dirMatch) dirName = dirMatch[1];

    if (!(await self.app.vault.adapter.exists(dirName)))
      // @ts-expect-error
      await createFolder(dirName, app);

    return await self.plugin.app.vault.adapter.append(path, `\n${data}`);
  };

  const error = async (context: any) => {
    await self.plugin.handelError(context);
    throw new Error(context);
  };

  const read = async (path: string) => {
    return await Read(path, self.plugin);
  };

  const Helpers = {
    each: async (context: any, options: any) => {
      if (!options) {
        throw new Exception("Must pass iterator to #each");
      }
      const fn = options.fn,
        inverse = options.inverse;

      let i = 0,
        ret = "",
        data: any;

      if (typeof context == "function") {
        // @ts-ignore
        context = await context.call(this);
      }

      if (options.data) {
        data = createFrame(options.data);
      }

      async function execIteration(
        field: any,
        value: any,
        index: any,
        last?: any
      ) {
        if (data) {
          data.key = field;
          data.index = index;
          data.first = index === 0;
          data.last = !!last;
        }

        ret =
          ret +
          (await fn(value, {
            data: data,
            blockParams: [context[field], field],
          }));
      }

      if (context && typeof context === "object") {
        if (Array.isArray(context)) {
          for (let j = context.length; i < j; i++) {
            if (i in context) {
              await execIteration(i, context[i], i, i === context.length - 1);
            }
          }
        } else if (isMap(context)) {
          const j = context.size;
          for (const [key, value] of context) {
            await execIteration(key, value, i++, i === j);
          }
        } else if (isSet(context)) {
          const j = context.size;
          for (const value of context) {
            await execIteration(i, value, i++, i === j);
          }
        } else if (typeof Symbol === "function" && context[Symbol.iterator]) {
          const newContext = [];
          const iterator = context[Symbol.iterator]();
          for (let it = iterator.next(); !it.done; it = iterator.next()) {
            newContext.push(it.value);
          }
          context = newContext;
          for (let j = context.length; i < j; i++) {
            await execIteration(i, context[i], i, i === context.length - 1);
          }
        } else {
          let priorKey: any;

          for (const key in context) {
            if (Object.prototype.hasOwnProperty.call(context, key)) {
              // We're running the iterations one step out of sync so we can detect
              // the last iteration without have to scan the object twice and create
              // an intermediate keys array.
              if (priorKey !== undefined) {
                await execIteration(priorKey, context[priorKey], i - 1);
              }
              priorKey = key;
              i++;
            }
          }

          if (priorKey !== undefined) {
            await execIteration(priorKey, context[priorKey], i - 1, true);
          }
        }
      }

      if (i === 0) {
        // @ts-ignore
        ret = inverse(this);
      }

      return ret;
    },

    length: function (str: string) {
      return str.length;
    },

    substring: function (string: string, start: number, end: number) {
      const subString = string.substring(start, end);
      return new Handlebars.SafeString(subString);
    },

    replace: function (string: string, search: string, replace: string) {
      const replacedString = string.replace(new RegExp(search, "g"), replace);
      return new Handlebars.SafeString(replacedString);
    },

    date: function () {
      const currentDate = new Date().toLocaleString();
      return new Handlebars.SafeString(currentDate);
    },

    truncate: function (string: string, length: number) {
      if (string.length > length) {
        return new Handlebars.SafeString(string.substring(0, length) + "...");
      } else {
        return new Handlebars.SafeString(string);
      }
    },

    tail: function (string: string, length: number) {
      if (string.length > length) {
        return new Handlebars.SafeString(
          "..." + string.substring(string.length - length)
        );
      } else {
        return new Handlebars.SafeString(string);
      }
    },

    split: function (string: string, separator: string) {
      const splitArray = string.split(separator);
      return splitArray;
    },

    join: function (array: Array<string>, separator: string) {
      const joinedString = array.join(separator);
      return new Handlebars.SafeString(joinedString);
    },

    unique: function (array: Array<string>) {
      const uniqueArray = [...new Set(array)];
      return new Handlebars.SafeString(JSON.stringify(uniqueArray));
    },

    trim: function (string: string) {
      const trimmedString = string.trim();
      return new Handlebars.SafeString(trimmedString);
    },

    async getRandomFile(str = "", minLength?: number, maxLength?: number) {
      let files = self.app.vault.getMarkdownFiles();

      if (str) {
        const filteredFiles = files.filter(
          (file) =>
            file.path.match(str) && (!minLength || file.stat.size >= minLength)
        );
        if (filteredFiles.length === 0) {
          throw new Error(`No files match the pattern ${str}`);
        }
        files = filteredFiles;
      }

      const randomIndex = Math.floor(Math.random() * files.length);
      const randomFile = files[randomIndex];

      let content = await self.app.vault.read(randomFile);
      const fileName = randomFile.name;

      if (maxLength && content.length > maxLength) {
        content = content.substring(0, maxLength) + "...";
      }

      const output = `filename: ${fileName}\n content: ${content}`;
      return output;
    },

    eq: function (value1: any, value2: any) {
      return value1 === value2;
    },

    stringify: function (context: any) {
      return JSON.stringify(context);
    },

    parse: function (context: any) {
      return JSON5.parse(context);
    },

    escp: async function (context: any) {
      let t = context?.fn ? await context?.fn(context.data.root) : "" + context;

      while (t?.contains("\n")) {
        t = t?.replaceAll("\n", " ");
      }

      while (t?.contains("\\n")) {
        t = t?.replaceAll("\\n", " ");
      }

      while (t?.contains("\\")) {
        t = t?.replaceAll("\\", " ");
      }

      const k = JSON.stringify(t);
      return k.substring(1, k.length - 1);
    },

    escp2: async function (context: any) {
      const t = await Helpers.escp(context);

      return await Helpers.trim(t);
    },

    encodeURI: async function (context: any) {
      const t = context?.fn
        ? await context?.fn(context.data.root)
        : "" + context;
      return encodeURIComponent(t);
    },

    error: async function (context: any) {
      await error(context);
    },

    notice: function (context: any, duration: any) {
      new Notice(context, typeof duration == "object" ? undefined : +duration);
    },

    async log(...vars: any[]) {
      let fnExists = false;
      if (vars[vars.length - 1].fn) {
        fnExists = true;
        vars[vars.length - 1] = (await vars[vars.length - 1].fn?.(this)) || "";
      } else delete vars[vars.length - 1];

      // try to json parse them
      vars.forEach((v, i) => {
        try {
          vars[i] = JSON5.parse(v);
        } catch {
          // empty
        }
      });

      if (!fnExists && !vars[vars.length - 1]) vars.pop();
      console.log(...vars);
      return "";
    },

    async package(packageId: string, version?: string) {
      if (!(await self.plugin.textGenerator.packageExists(packageId)))
        throw new Error(`package ${packageId} was not found.`);
      return true;
    },

    async run(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();

      const firstVar = vars.shift();
      if (!firstVar?.contains("/") && !options.data.root.templatePath) {
        throw new Error("templatePath was not found in run command");
      }

      const p = options.data.root.templatePath?.split("/");
      const parentPackageId = p[p.length - 2];

      const id: string = firstVar?.contains("/")
        ? firstVar
        : `${parentPackageId}/${firstVar}`;

      const otherVariables = vars;

      const templatePath = await self.plugin.textGenerator.getTemplatePath(id);

      if (!templatePath)
        throw new Error(
          `template with packageId/promptId ${id} was not found.`
        );

      const TemplateMetadata = self.getFrontmatter(
        self.getMetaData(templatePath)
      );

      let varname = id;
      let innerResult = {};

      if (options.fn) {
        varname = otherVariables[0];
        const param = otherVariables[1] || "tg_selection";

        const innerTxt =
          (await options.fn?.({
            ...this,
            ...TemplateMetadata,
          })) || "{}";

        try {
          innerResult = innerTxt.trim().startsWith("{")
            ? JSON5.parse(innerTxt)
            : {
                [param]: innerTxt,
              };
        } catch (err: any) {
          innerResult = {
            [param]: innerTxt,
          };
          console.warn(
            "couldn't parse data passed to ",
            id,
            {
              content: innerTxt,
            },
            err
          );
        }
      } else {
        if (otherVariables[0]) varname = otherVariables[0];

        const param = otherVariables[2] || "tg_selection";

        const innerTxt = otherVariables[1];

        innerResult = {
          [otherVariables.length > 1 ? param : "tg_selection"]: innerTxt,
        };
      }

      lodashSet(
        options.data.root,
        otherVariables.length >= 1 ? `vars["${otherVariables[0]}"]` : id,
        await _runTemplate(id, {
          ...options.data.root,
          disableProvider: false,
          ...TemplateMetadata,
          ...innerResult,
        })
      );

      return "";
    },

    async get(...vars: any[]) {
      const additionalOptions = vars.pop();
      const templateId = vars.shift();

      const clean = vars[0];

      const p = additionalOptions.data.root.templatePath?.split("/");
      const parentPackageId = Object.keys(ExtractorSlug).includes(templateId)
        ? "extractions"
        : p[p.length - 2];

      const id: string = templateId?.contains("/")
        ? // if it has a slash that means it already have the packageId
          `["${templateId}"]`
        : // checking for vars
          Object.keys(additionalOptions.data.root.vars || {}).includes(
              templateId
            )
          ? `vars["${templateId}"]`
          : // make packageId/templateId
            `["${parentPackageId}/${templateId}"]`;

      const val = lodashGet(additionalOptions.data.root, id);

      return clean ? JSON.stringify(val) : val;
    },

    async set(...vars: any[]) {
      const additionalOptions = vars.pop();

      const id = `vars["${vars[0]}"]`;

      let value = vars[1];

      if (additionalOptions.fn) {
        value = await additionalOptions.fn(this);
      }

      lodashSet(additionalOptions.data.root, id, value);
      return "";
    },

    async setProperty(...vars: any[]) {
      const self2 = this as any as AvailableContext;

      if (!self2.noteFile?.path) return;

      const additionalOptions = vars.pop();

      const id = vars[0];

      let value = vars[1];

      if (additionalOptions.fn) {
        value = (await additionalOptions.fn(this)).trim();
      }

      self.app.fileManager.processFrontMatter(self2.noteFile, (frontMatter) => {
        frontMatter[id] = value;
        return frontMatter;
      });

      // lodashSet(additionalOptions.data.root, id, value);
      return "";
    },

    async setTitle(...vars: any[]) {
      const self2 = this as any as AvailableContext;

      if (!self2.noteFile?.path) return;
      console.log(vars.length);
      const additionalOptions = vars.pop();

      let value = vars[0];

      if (additionalOptions?.fn) {
        value = ("" + (await additionalOptions.fn(this)))?.trim();
      }
      console.log({ n: self2.noteFile, value });
      await self.app.fileManager.renameFile(self2.noteFile, value);
      return "";
    },

    async extract(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();

      const firstVar = vars.shift();

      const id: string = firstVar?.contains("/")
        ? firstVar
        : `extractions/${firstVar}`;

      const otherVariables = vars;

      if (!(firstVar in ExtractorSlug))
        throw new Error(`Extractor ${firstVar} Not found`);

      let cntn = "";
      let varname = id;
      let other = "";
      if (options.fn) {
        cntn = await options.fn?.(this);
        if (otherVariables[0]) varname = `vars["${otherVariables[0]}"]`;
        other = otherVariables[1];
      } else {
        cntn = otherVariables[0];
        if (otherVariables[1]) varname = `vars["${otherVariables[1]}"]`;
        other = otherVariables[2];
      }

      const res = await extract(firstVar, cntn, other);

      lodashSet(options.data.root, varname, res);

      return res;
    },

    async regex(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();

      if (!options.fn) throw "you need to provide data to work with";

      const firstVar = vars.shift();

      if (!firstVar) throw "You need to set a variable name for regex";

      const otherVariables = vars;

      const cntn = ((await options.fn?.(this)) + "") as string;

      const reg = new RegExp(otherVariables[0], otherVariables[1]);

      const regexResults = cntn.match(reg);

      lodashSet(options.data.root, `vars["${firstVar}"]`, regexResults);
      return regexResults;
    },

    async runLang(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();

      const firstVar = vars.shift();

      const whatToGet: "system" | "prompt" = vars.shift();

      const inJson = {
        ...options.data.root,
        ...JSON5.parse(await options.fn(this)),
      };

      const data: { system: string; messages: string[]; prompt?: string } =
        await langPull(firstVar);

      data.system = await Handlebars.compile(data.system)(inJson);

      data.messages = await Promise.all(
        data.messages.map(async (msg) => await Handlebars.compile(msg)(inJson))
      );

      data.prompt = data.messages[data.messages?.length - 1] || "";

      switch (whatToGet) {
        case "system":
          return data.system;

        case "prompt":
          return data.prompt;

        default:
          return JSON.stringify({
            // ...inJson,
            ...data,
          });
      }
    },

    async pullLang(rep: string) {
      return JSON.stringify(await langPull(rep));
    },

    async wait(time: string) {
      await new Promise((s) => setTimeout(s, +(time || "1") * 1000));
    },

    async script(...vars: any[]) {
      if (!self.plugin.settings.allowJavascriptRun)
        throw new Error(
          "Scripts are not allowed to run, for security reasons. Go to plugin settings and enable it"
        );
      const options = vars.pop();

      options.data.root.vars ??= {};

      let content = ((await options?.fn?.(this)) as string) || "";

      const p = options.data.root.templatePath?.split("/");
      const parentPackageId = p?.[p?.length - 2] || "default";

      const gen = async (templateContent: string, metadata: any) => {
        return await self.plugin.textGenerator.gen(templateContent, {
          ...options.data.root,
          disableProvider: false,
          ...metadata,
        });
      };

      const genJSON = async (templateContent: string, metadata: any) => {
        return JSON5.parse(
          await gen(templateContent, {
            ...metadata,
            modelKwargs: { response_format: { type: "json_object" } },
          })
        );
      };

      const run = (id: string, metadata?: any) => {
        let meta: any = {};

        if (!id?.contains("/") && !options.data.root.templatePath) {
          throw new Error("templatePath was not found in run command");
        }

        const p = options.data.root.templatePath?.split("/");

        if (content.contains("run(")) {
          const [packageId, templateId] = id.contains("/")
            ? id.split("/")
            : [p[p.length - 2], id];

          console.log({
            paths: self.plugin.textGenerator.templatePaths,
            packageId,
            templateId,
          });
          const TemplateMetadata = self.getFrontmatter(
            self.getMetaData(
              self.plugin.textGenerator.templatePaths[packageId][templateId]
            )
          );
          meta = {
            ...options.data.root,
            disableProvider: false,
            ...TemplateMetadata,
          };
        }

        const Id = id?.contains("/") ? id : `${parentPackageId}/${id}`;

        return _runTemplate(Id, {
          ...meta,
          ...(typeof metadata == "object"
            ? metadata
            : {
                tg_selection: metadata,
              }),
        });
      };

      if (content.startsWith("```")) {
        const k = content.split("\n");
        k.pop();
        k.pop();
        k.shift();
        content = k.join("\n");
      }

      // do not use (0, eval), it will break "this", and the eval wont be able to access context
      return await runJsInSandbox(content, {
        ...this,
        plugin: self.plugin,
        app: self.app,
        pluginApi,
        run,
        gen,
        genJSON,
      });
    },

    read,

    async write(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();
      let data = vars[1];
      if (options.fn) data = await options.fn(options.data.root);
      return await write(vars[0], data);
    },

    async append(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();
      let data = vars[1];
      if (options.fn) data = await options.fn(options.data.root);
      return await append(vars[0], data);
    },

    async dataview(...vars: any[]) {
      const options: { data: { root: any }; fn: any } = vars.pop();
      if (!options.fn)
        throw new Error(
          "this helper only works in block form ex: {{#dataview}} your dataview {{/dataview}}"
        );
      const content = await options.fn(options.data.root);
      const api = await getDataviewApi(self.app);
      const res = await api?.queryMarkdown(content);

      if (!res) throw new Error("Couln't find DataViewApi");

      if (res?.successful) {
        return res.value;
      }

      throw new Error(res.error);
    },

    // get time now
    async timeNow() {
      return moment().format("HH:mm:ss");
    },

    // get date now
    async dateNow() {
      return moment().format("YYYY-MM-DD");
    },
  } as const;

  return Helpers;
}

export async function langPull(rep: string) {
  const k = (await pull(rep)).toJSON() as unknown as {
    kwargs: {
      messages?: {
        prompt: {
          inputVariables: string[];
          template: string;
        };
      }[];
      template?: string;
      input_variables: string[];
      template_format?: string;
    };
  };

  if (k.kwargs.template_format && k.kwargs.template_format != "f-string")
    throw new Error("only accepts templates with format f-string for now.");

  const data = compileLangMessages(
    k.kwargs.messages ||
      (k.kwargs.template
        ? [
            {
              prompt: {
                template: k.kwargs.template,
                inputVariables: k.kwargs.input_variables,
              },
            },
          ]
        : [])
  );

  return data;
}
